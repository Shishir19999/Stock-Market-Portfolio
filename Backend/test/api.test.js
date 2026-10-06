// Runs against a throwaway database (stocks_test_<pid>) that is dropped afterwards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
const { default: mongoose } = await import('mongoose');
const { default: request } = await import('supertest');
const { createApp } = await import('../app.js');

const app = createApp();

before(async () => {
  await mongoose.connect(`${BASE}/stocks_test_${process.pid}`);
  await mongoose.connection.dropDatabase();
  const rows = Array.from({ length: 30 }, (_, i) => ({
    company: `Company ${String(i).padStart(2, '0')}`,
    description: i % 3 === 0 ? 'Semiconductor maker' : 'Retail goods',
    symbol: `SYM${i}`,
    initial_price: 10 + i, price_2002: 5, price_2007: 8,
  }));
  await mongoose.connection.collection('stocks').insertMany(rows);
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('GET /api/stocks paginates', async () => {
  let r = await request(app).get('/api/stocks?page=1&limit=12');
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.page, r.body.limit, r.body.total, r.body.pages, r.body.data.length], [1, 12, 30, 3, 12]);
  assert.equal(r.body.data[0].company, 'Company 00');
  r = await request(app).get('/api/stocks?page=3&limit=12');
  assert.equal(r.body.data.length, 6);
  r = await request(app).get('/api/stocks?page=99&limit=12');
  assert.deepEqual([r.body.data.length, r.body.total], [0, 30]);
  r = await request(app).get('/api/stocks');
  assert.equal(r.body.limit, 12, 'default limit');
  r = await request(app).get('/api/stocks?limit=100000&page=abc');
  assert.deepEqual([r.body.limit, r.body.page, r.body.data.length], [100, 1, 30]);
});

test('GET /api/stocks search (company, symbol, description; regex-safe)', async () => {
  let r = await request(app).get('/api/stocks?search=company 07');
  assert.equal(r.body.total, 1);
  r = await request(app).get('/api/stocks?search=sym2');
  assert.equal(r.body.total, 11); // SYM2, SYM20..SYM29
  r = await request(app).get('/api/stocks?search=semiconductor&limit=4&page=2');
  assert.deepEqual([r.body.total, r.body.pages, r.body.data.length], [10, 3, 4]);
  r = await request(app).get('/api/stocks?search=' + encodeURIComponent('(['));
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 0);
});

test('watchlist: add, duplicate, validation, list, delete', async () => {
  assert.equal((await request(app).post('/api/watchlist').send({})).status, 400);
  assert.equal((await request(app).post('/api/watchlist').send({ symbol: 'x', initial_price: 'abc' })).status, 400);
  assert.equal((await request(app).post('/api/watchlist').send({ symbol: 'aapl', company: 'Apple' })).status, 201);
  assert.equal((await request(app).post('/api/watchlist').send({ symbol: 'AAPL' })).status, 409);
  let r = await request(app).get('/api/watchlist');
  assert.deepEqual(r.body.map((w) => w.symbol), ['AAPL']);
  assert.equal((await request(app).delete('/api/watchlist/aapl')).status, 200);
  assert.equal((await request(app).delete('/api/watchlist/aapl')).status, 404);
  r = await request(app).get('/api/stocks?limit=100');
  assert.equal(r.body.total, 30, 'watchlist does not pollute stocks');
});

test('malformed JSON is a 400, not a crash', async () => {
  const r = await request(app).post('/api/watchlist').set('Content-Type', 'application/json').send('{bad');
  assert.equal(r.status, 400);
});
