// Runs against a throwaway database (st_auth_test_<pid>) that is dropped afterwards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET = 'test-secret-not-for-production';
const { default: mongoose } = await import('mongoose');
const { default: request } = await import('supertest');
const { createApp } = await import('../app.js');
const { createMarket } = await import('../lib/market.js');

const app = createApp({ market: createMarket({ env: {} }) });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
let admin;
let user;
let pf;

before(async () => {
  await mongoose.connect(`${BASE}/st_auth_test_${process.pid}`);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.collection('stocks').insertMany([
    { symbol: 'AAA', company: 'Alpha Corp', description: 'x', initial_price: 100, price_2002: 50, price_2007: 80 },
    { symbol: 'BBB', company: 'Beta Corp', description: 'y', initial_price: 20, price_2002: 10, price_2007: 15 },
  ]);
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('first account becomes admin, second is a user; validation and duplicates', async () => {
  assert.equal((await request(app).post('/api/auth/signup').send({ name: 'A', email: 'bad', password: 'x' })).status, 400);
  let r = await request(app).post('/api/auth/signup').send({ name: 'Ada Admin', email: 'ada@example.com', password: 'password1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'admin');
  assert.equal(r.body.user.passwordHash, undefined);
  admin = r.body;
  r = await request(app).post('/api/auth/signup').send({ name: 'Uma User', email: 'UMA@example.com', password: 'password2' });
  assert.equal(r.body.user.role, 'user');
  assert.equal(r.body.user.email, 'uma@example.com');
  user = r.body;
  assert.equal((await request(app).post('/api/auth/signup').send({ name: 'Uma Two', email: 'uma@example.com', password: 'password3' })).status, 409);
  assert.equal((await request(app).post('/api/auth/signup').send({ name: 'Short', email: 's@example.com', password: 'short' })).status, 400);
});

test('login, wrong password, me, and missing or bad tokens', async () => {
  assert.equal((await request(app).post('/api/auth/login').send({ email: 'uma@example.com', password: 'nope-nope' })).status, 401);
  const ok = await request(app).post('/api/auth/login').send({ email: 'uma@example.com', password: 'password2' });
  assert.equal(ok.status, 200);
  assert.equal((await request(app).get('/api/auth/me').set(auth(ok.body.token))).body.user.name, 'Uma User');
  assert.equal((await request(app).get('/api/data')).status, 401);
  assert.equal((await request(app).get('/api/data').set(auth('garbage'))).status, 401);
});

test('data loads with defaults, quotes and public settings', async () => {
  const r = await request(app).get('/api/data').set(auth(user.token));
  assert.equal(r.status, 200);
  assert.equal(r.body.portfolios.length, 1);
  assert.equal(r.body.transactions[0].type, 'deposit');
  assert.equal(r.body.transactions[0].amount, 25000);
  assert.equal(r.body.quotes.source, 'simulated');
  assert.ok(r.body.quotes.prices.AAA.price > 0);
  assert.equal(r.body.settings.refreshSeconds, 5);
  pf = r.body.portfolios[0];
});

test('transactions: add, validation, ledger rules, import and delete', async () => {
  const h = auth(user.token);
  const base = { portfolioId: pf.id, date: '2026-01-05' };
  let r = await request(app).post('/api/transactions').set(h).send({ ...base, type: 'buy', symbol: 'AAA', shares: 5, price: 100 });
  assert.equal(r.status, 400, 'backdated before the starting deposit');
  r = await request(app).post('/api/transactions').set(h).send({ ...base, type: 'deposit', amount: 1000 });
  assert.equal(r.status, 201);
  r = await request(app).post('/api/transactions').set(h).send({ ...base, type: 'buy', symbol: 'AAA', shares: 5, price: 100, fee: 1 });
  assert.equal(r.status, 201);
  const buyId = r.body.id;
  assert.equal((await request(app).post('/api/transactions').set(h).send({ ...base, type: 'buy', symbol: 'ZZZ', shares: 1, price: 1 })).body.error, 'Unknown stock ZZZ.');
  assert.equal((await request(app).post('/api/transactions').set(h).send({ ...base, type: 'sell', symbol: 'AAA', shares: 9, price: 1 })).status, 400);
  r = await request(app).post('/api/transactions/import').set(h).send({ portfolioId: pf.id, rows: [{ ...base, date: '2026-01-06', type: 'sell', symbol: 'AAA', shares: 2, price: 110 }] });
  assert.deepEqual([r.status, r.body.imported], [201, 1]);
  r = await request(app).post('/api/transactions/import').set(h).send({ portfolioId: pf.id, rows: [{ ...base, type: 'oops' }] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Row 1/);
  r = await request(app).delete(`/api/transactions/${buyId}`).set(h);
  assert.equal(r.status, 400, 'later sell depends on the buy');
  assert.equal((await request(app).delete('/api/transactions/not-an-id').set(h)).status, 404);
});

test('orders: market fills, limit stays open, cancel, and isolation between users', async () => {
  const h = auth(user.token);
  let r = await request(app).post('/api/orders').set(h).send({ portfolioId: pf.id, symbol: 'BBB', side: 'buy', type: 'market', shares: 3 });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.status, 'filled');
  assert.ok(r.body.tx.price > 0);
  r = await request(app).post('/api/orders').set(h).send({ portfolioId: pf.id, symbol: 'BBB', side: 'buy', type: 'limit', shares: 1, limitPrice: 1 });
  assert.equal(r.body.order.status, 'open');
  const id = r.body.order.id;
  assert.equal((await request(app).post('/api/orders').set(h).send({ portfolioId: pf.id, symbol: 'BBB', side: 'buy', type: 'limit', shares: 1 })).status, 400);
  assert.equal((await request(app).delete(`/api/orders/${id}`).set(auth(admin.token))).status, 404, 'other users cannot cancel it');
  assert.equal((await request(app).delete(`/api/orders/${id}`).set(h)).body.status, 'cancelled');
  const other = await request(app).get('/api/data').set(auth(admin.token));
  assert.equal(other.body.transactions.length, 1, 'admin sees only own data');
  const s = await request(app).post('/api/sync').set(h);
  assert.deepEqual(Object.keys(s.body.events), ['fills', 'rejected', 'triggered']);
});

test('portfolios, watchlists, alerts, goals, notifications and reset', async () => {
  const h = auth(user.token);
  let r = await request(app).post('/api/portfolios').set(h).send({ name: 'Growth', method: 'AVG', startingCash: 500 });
  assert.equal(r.status, 201);
  const second = r.body;
  assert.equal((await request(app).patch(`/api/portfolios/${second.id}`).set(h).send({ targets: { AAA: 60, BBB: 50 } })).status, 400);
  assert.deepEqual((await request(app).patch(`/api/portfolios/${second.id}`).set(h).send({ targets: { AAA: 60 } })).body.targets, { AAA: 60 });
  r = await request(app).post('/api/watchlists').set(h).send({ name: 'Tech', symbols: ['aaa'] });
  assert.deepEqual(r.body.symbols, ['AAA']);
  assert.equal((await request(app).patch(`/api/watchlists/${r.body.id}`).set(h).send({ symbols: ['NOPE'] })).status, 400);
  r = await request(app).post('/api/alerts').set(h).send({ symbol: 'AAA', direction: 'above', target: 1 });
  assert.equal(r.status, 201);
  const ev = await request(app).post('/api/sync').set(h);
  assert.equal(ev.body.events.triggered.length, 1);
  const data = await request(app).get('/api/data').set(h);
  assert.equal(data.body.notifications.length, 1);
  assert.equal((await request(app).post('/api/notifications/read').set(h)).status, 200);
  r = await request(app).post('/api/goals').set(h).send({ name: 'Car', target: 10000, deadline: '2030-01-01' });
  assert.equal(r.status, 201);
  assert.equal((await request(app).delete(`/api/goals/${r.body.id}`).set(h)).status, 200);
  assert.equal((await request(app).delete(`/api/portfolios/${second.id}`).set(h)).status, 200);
  assert.equal((await request(app).post('/api/account/reset').set(h)).status, 200);
  const fresh = await request(app).get('/api/data').set(h);
  assert.deepEqual([fresh.body.transactions.length, fresh.body.alerts.length, fresh.body.portfolios.length], [1, 0, 1]);
  pf = fresh.body.portfolios[0];
  assert.equal((await request(app).delete(`/api/portfolios/${pf.id}`).set(h)).status, 400, 'last portfolio');
});

test('admin: role checks, users, settings, audit, stats', async () => {
  assert.equal((await request(app).get('/api/admin/users').set(auth(user.token))).status, 403);
  assert.equal((await request(app).get('/api/admin/users')).status, 401);
  const a = auth(admin.token);
  let r = await request(app).get('/api/admin/users').set(a);
  assert.equal(r.body.length, 2);
  assert.equal(r.body[0].passwordHash, undefined);
  const uma = r.body.find((u) => u.email === 'uma@example.com');
  assert.equal((await request(app).patch(`/api/admin/users/${admin.user.id}`).set(a).send({ role: 'user' })).status, 400, 'cannot demote self');
  assert.equal((await request(app).patch(`/api/admin/users/${uma.id}`).set(a).send({ role: 'wizard' })).status, 400);
  r = await request(app).put('/api/admin/settings').set(a).send({ commission: 2, refreshSeconds: 10, startingCash: 5000 });
  assert.deepEqual([r.body.settings.commission, r.body.settings.refreshSeconds], [2, 10]);
  assert.equal((await request(app).put('/api/admin/settings').set(a).send({ refreshSeconds: 1 })).status, 400);
  assert.equal((await request(app).get('/api/data').set(auth(user.token))).body.settings.commission, 2);
  const d = await request(app).get('/api/data').set(auth(user.token));
  const o = await request(app).post('/api/orders').set(auth(user.token)).send({ portfolioId: d.body.portfolios[0].id, symbol: 'AAA', side: 'buy', type: 'market', shares: 1 });
  assert.equal(o.body.tx.fee, 2, 'commission is applied to fills');
  await request(app).put('/api/admin/settings').set(a).send({ allowSignups: false });
  assert.equal((await request(app).post('/api/auth/signup').send({ name: 'Late Comer', email: 'late@example.com', password: 'password9' })).status, 403);
  await request(app).put('/api/admin/settings').set(a).send({ allowSignups: true });
  assert.equal((await request(app).patch(`/api/admin/users/${uma.id}`).set(a).send({ role: 'admin' })).body.role, 'admin');
  assert.equal((await request(app).patch(`/api/admin/users/${uma.id}`).set(a).send({ role: 'user', active: false })).body.active, false);
  assert.equal((await request(app).get('/api/data').set(auth(user.token))).status, 401, 'deactivated tokens stop working');
  assert.equal((await request(app).post('/api/auth/login').send({ email: 'uma@example.com', password: 'password2' })).status, 403);
  await request(app).patch(`/api/admin/users/${uma.id}`).set(a).send({ active: true });
  r = await request(app).get('/api/admin/audit').set(a);
  const actions = r.body.map((x) => x.action);
  for (const k of ['signup', 'login', 'settings.update', 'user.update']) assert.ok(actions.includes(k), k);
  r = await request(app).get('/api/admin/stats').set(a);
  assert.equal(r.body.users, 2);
  assert.equal((await request(app).delete(`/api/admin/users/${admin.user.id}`).set(a)).status, 400);
  assert.equal((await request(app).delete(`/api/admin/users/${uma.id}`).set(a)).status, 200);
  assert.equal((await request(app).get('/api/admin/users').set(a)).body.length, 1);
});
