// In-browser backend for the live preview. Same interface as real.js, but everything lives in localStorage:
// seeded stocks, accounts, sessions, settings and audit log. Nothing ever leaves the visitor's browser.
// All account rules come from the shared service, exactly as on the server.
import catalogue from '@shared/data/stocks.json';
import { dailySeries, simulatedQuotes } from '@shared/market.js';
import { createMemoryStore } from '@shared/memoryStore.js';
import * as svc from '@shared/service.js';
import { DEFAULT_SETTINGS, ValidationError, normalizeCredentials, normalizeSettings } from '@shared/validate.js';
import { ApiError, memoryStorage } from './errors.js';

export const DEMO_LOGINS = [
  { name: 'Demo Investor', email: 'demo@example.com', password: 'demo1234', role: 'user', note: 'User: two portfolios, watchlists, alerts, an open order and goals' },
  { name: 'New Investor', email: 'new@example.com', password: 'demo1234', role: 'user', note: 'User: empty portfolio with $25,000 cash' },
  { name: 'Admin', email: 'admin@example.com', password: 'admin1234', role: 'admin', note: 'Admin: users, market data settings and audit log' },
];

const USERS_KEY = 'smp:users';
const SESSION_KEY = 'smp:session';
const SETTINGS_KEY = 'smp:settings';
const AUDIT_KEY = 'smp:audit';
const SEEDED_KEY = 'smp:seeded:v2';
const DATA_PREFIX = 'smp:data:';
const DAY = 86400000;
const SYMBOLS = new Set(catalogue.map((s) => s.symbol));
const bySym = Object.fromEntries(catalogue.map((s) => [s.symbol, s]));

// Not security: a tiny non-cryptographic hash so plain passwords are not sitting in storage. Preview only.
const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
};

/** Close of `symbol` on or before time t. */
function closeOn(symbol, t, now) {
  const series = dailySeries(bySym[symbol], now);
  let c = series[0].c;
  for (const p of series) {
    if (p.t <= t) c = p.c;
    else break;
  }
  return c;
}

/** A believable starting account for the demo user, dated relative to `now`. */
export async function seedDemoAccount(store, uid, now = Date.now()) {
  const ctx = { settings: { ...DEFAULT_SETTINGS }, now: () => now, quotes: simulatedQuotes(catalogue, now), symbols: SYMBOLS };
  const at = (daysAgo) => new Date(now - daysAgo * DAY).toISOString();
  const tx = (portfolioId, daysAgo, type, extra = {}) => store.insert('transactions', uid, { portfolioId, type, date: at(daysAgo), fee: 0, note: '', ...extra });
  const trade = (portfolioId, daysAgo, type, symbol, shares) => {
    const price = closeOn(symbol, now - daysAgo * DAY, now);
    return tx(portfolioId, daysAgo, type, { symbol, shares, price, amount: Math.round(shares * price * 100) / 100, fee: 1 });
  };
  const main = await store.insert('portfolios', uid, {
    name: 'Main portfolio', method: 'FIFO', createdAt: at(88),
    targets: { AAPL: 10, MSFT: 20, NVDA: 10, GOOGL: 10, KO: 15, JPM: 15 },
  });
  const retire = await store.insert('portfolios', uid, { name: 'Retirement (average cost)', method: 'AVG', targets: {}, createdAt: at(80) });
  await tx(main.id, 88, 'deposit', { amount: 60000, note: 'Starting cash' });
  await tx(main.id, 31, 'deposit', { amount: 5000, note: 'Monthly top-up' });
  for (const [d, s, n] of [[80, 'AAPL', 6000], [74, 'MSFT', 300], [66, 'NVDA', 500], [58, 'GOOGL', 40], [49, 'KO', 150], [41, 'JPM', 120], [33, 'AMZN', 120], [20, 'XOM', 60], [9, 'MSFT', 100]]) {
    await trade(main.id, d, 'buy', s, n);
  }
  await trade(main.id, 14, 'sell', 'KO', 40);
  await tx(main.id, 40, 'dividend', { symbol: 'KO', amount: 61.5, note: 'Quarterly dividend' });
  await tx(main.id, 8, 'dividend', { symbol: 'MSFT', amount: 78, note: 'Quarterly dividend' });
  await tx(retire.id, 75, 'deposit', { amount: 20000, note: 'Starting cash' });
  for (const [d, s, n] of [[70, 'JPM', 100], [66, 'XOM', 50], [40, 'JPM', 50], [35, 'PG', 80]]) await trade(retire.id, d, 'buy', s, n);
  await trade(retire.id, 10, 'sell', 'JPM', 60);
  await store.insert('watchlists', uid, { name: 'Growth ideas', symbols: ['TSLA', 'NFLX', 'AMD', 'DIS', 'V'] });
  await store.insert('watchlists', uid, { name: 'Dividend payers', symbols: ['KO', 'PEP', 'JNJ', 'PG', 'T', 'VZ'] });
  const px = (s) => ctx.quotes[s].price;
  await store.insert('alerts', uid, { symbol: 'TSLA', direction: 'above', target: Math.round(px('TSLA') * 1.01 * 100) / 100, createdAt: at(2), triggeredAt: null });
  await store.insert('alerts', uid, { symbol: 'NFLX', direction: 'below', target: Math.round(px('NFLX') * 0.985 * 100) / 100, createdAt: at(2), triggeredAt: null });
  await store.insert('orders', uid, {
    portfolioId: main.id, symbol: 'AMD', side: 'buy', type: 'limit', shares: 50, limitPrice: Math.round(px('AMD') * 0.97 * 100) / 100,
    status: 'open', createdAt: at(1), filledAt: null, fillPrice: null, reason: '',
  });
  await store.insert('goals', uid, { name: 'Reach $100,000', target: 100000, portfolioId: 'all', deadline: new Date(now + 540 * DAY).toISOString().slice(0, 10), monthly: 1000, returnPct: 6, createdAt: at(60) });
  await store.insert('goals', uid, { name: 'Retirement pot', target: 30000, portfolioId: retire.id, deadline: new Date(now + 900 * DAY).toISOString().slice(0, 10), monthly: 200, returnPct: 5, createdAt: at(60) });
  await store.insert('notifications', uid, { text: 'Welcome to the live preview. Everything here is sample data stored in your browser.', kind: 'info', date: at(0), read: false });
}

export function createDemoApi({ storage = globalThis.localStorage || memoryStorage(), latency = [120, 360], now = () => new Date() } = {}) {
  const get = (k) => {
    try {
      return JSON.parse(storage.getItem(k));
    } catch {
      return null;
    }
  };
  const put = (k, v) => storage.setItem(k, JSON.stringify(v));
  const store = createMemoryStore({ load: (uid) => get(DATA_PREFIX + uid), save: (uid, data) => put(DATA_PREFIX + uid, data) });
  const sleep = () => {
    const [lo, hi] = latency;
    const ms = hi > 0 ? lo + Math.random() * (hi - lo) : 0;
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  };
  const users = () => get(USERS_KEY) || [];
  const saveUsers = (list) => put(USERS_KEY, list);
  const settings = () => ({ ...DEFAULT_SETTINGS, ...(get(SETTINGS_KEY) || {}) });
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt });
  const log = (actor, action, target = '', detail = '') => {
    const list = get(AUDIT_KEY) || [];
    list.unshift({ id: `a${now().getTime().toString(36)}${list.length}`, at: now().toISOString(), actorName: actor?.name || 'system', action, target, detail });
    put(AUDIT_KEY, list.slice(0, 300));
  };
  const ctx = () => {
    const t = now().getTime();
    return { settings: settings(), now: () => t, quotes: simulatedQuotes(catalogue, t), symbols: SYMBOLS };
  };
  const quotesOf = (c) => ({ source: 'simulated', asOf: c.now(), prices: c.quotes });
  const pub = (s) => ({ allowSignups: s.allowSignups, startingCash: s.startingCash, commission: s.commission, marketSource: 'simulated', refreshSeconds: s.refreshSeconds });

  const ensureSeeded = async () => {
    if (storage.getItem(SEEDED_KEY)) return;
    const t = now().toISOString();
    saveUsers(DEMO_LOGINS.map((d, i) => ({ id: `demo-${i + 1}`, name: d.name, email: d.email, hash: hash(d.password), role: d.role, active: true, createdAt: t, lastLoginAt: null })));
    await seedDemoAccount(store, 'demo-1', now().getTime());
    log(null, 'seed', '', 'Sample accounts created');
    storage.setItem(SEEDED_KEY, '1');
  };
  const ready = ensureSeeded();

  const me = () => {
    const id = storage.getItem(SESSION_KEY);
    const u = users().find((x) => x.id === id);
    if (!u || !u.active) throw new ApiError('Please sign in again.', 401);
    return u;
  };
  const admin = () => {
    const u = me();
    if (u.role !== 'admin') throw new ApiError('Administrator access is required.', 403);
    return u;
  };
  // Run `fn(uid, ctx)` after latency; maps shared-service errors to ApiError.
  const run = (fn) => async (...args) => {
    await ready;
    await sleep();
    const u = me();
    try {
      return await fn(u.id, ctx(), ...args);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (e && e.status) throw new ApiError(e.message, e.status, e.field);
      throw e;
    }
  };
  const resource = (create, update, remove) => ({
    create: run((uid, c, input) => create(store, uid, input, c)),
    update: run((uid, c, id, input) => update(store, uid, id, input, c)),
    remove: run(async (uid, c, id) => {
      await remove(store, uid, id);
      return { ok: true };
    }),
  });
  const checkUsers = (fn) => async (...args) => {
    await ready;
    await sleep();
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError || !e?.status) throw e;
      throw new ApiError(e.message, e.status, e.field);
    }
  };

  return {
    mode: 'demo',
    authRequired: true,
    auth: {
      session() {
        const id = storage.getItem(SESSION_KEY);
        const u = users().find((x) => x.id === id && x.active);
        return u ? publicUser(u) : null;
      },
      login: checkUsers(async (email, password) => {
        const c = normalizeCredentials({ email, password });
        const list = users();
        const u = list.find((x) => x.email === c.email);
        if (!u || u.hash !== hash(c.password)) throw new ApiError('Incorrect email or password.', 401);
        if (!u.active) throw new ApiError('This account has been deactivated.', 403);
        u.lastLoginAt = now().toISOString();
        saveUsers(list);
        storage.setItem(SESSION_KEY, u.id);
        log(u, 'login', u.email);
        return publicUser(u);
      }),
      signup: checkUsers(async (name, email, password) => {
        const c = normalizeCredentials({ name, email, password }, { signup: true });
        const list = users();
        if (!settings().allowSignups) throw new ApiError('New sign-ups are turned off.', 403);
        if (list.some((u) => u.email === c.email)) throw new ApiError('An account with this email already exists.', 409);
        const user = { id: `u-${now().getTime().toString(36)}`, name: c.name, email: c.email, hash: hash(c.password), role: 'user', active: true, createdAt: now().toISOString(), lastLoginAt: now().toISOString() };
        saveUsers([...list, user]);
        storage.setItem(SESSION_KEY, user.id);
        await svc.initUser(store, user.id, ctx());
        log(user, 'signup', user.email);
        return publicUser(user);
      }),
      async logout() {
        await ready;
        await sleep();
        const id = storage.getItem(SESSION_KEY);
        const u = users().find((x) => x.id === id);
        if (u) log(u, 'logout', u.email);
        storage.removeItem(SESSION_KEY);
      },
    },
    stocks: {
      async all() {
        await sleep();
        return catalogue.map((s) => ({ ...s }));
      },
    },
    load: run(async (uid, c) => {
      await svc.sync(store, uid, c);
      return { user: publicUser(me()), settings: pub(c.settings), quotes: quotesOf(c), ...(await svc.loadAll(store, uid, c)) };
    }),
    // Ticks are local and instant: no artificial latency.
    async sync() {
      await ready;
      const u = me();
      const c = ctx();
      const events = await svc.sync(store, u.id, c);
      return { events, quotes: quotesOf(c), settings: pub(c.settings) };
    },
    portfolios: resource(
      (s, uid, input, c) => svc.createPortfolio(s, uid, input, c),
      (s, uid, id, input) => svc.updatePortfolio(s, uid, id, input),
      (s, uid, id) => svc.deletePortfolio(s, uid, id),
    ),
    transactions: {
      create: run((uid, c, input) => svc.addTransaction(store, uid, input, c)),
      import: run((uid, c, portfolioId, rows) => svc.importTransactions(store, uid, portfolioId, rows, c)),
      remove: run(async (uid, c, id) => {
        await svc.deleteTransaction(store, uid, id);
        return { ok: true };
      }),
    },
    orders: {
      place: run((uid, c, input) => svc.placeOrder(store, uid, input, c)),
      cancel: run((uid, c, id) => svc.cancelOrder(store, uid, id)),
    },
    watchlists: resource(
      (s, uid, input, c) => svc.createWatchlist(s, uid, input, c),
      (s, uid, id, input, c) => svc.updateWatchlist(s, uid, id, input, c),
      (s, uid, id) => svc.removeFrom(s, uid, 'watchlists', id),
    ),
    alerts: {
      create: run((uid, c, input) => svc.createAlert(store, uid, input, c)),
      remove: run(async (uid, c, id) => {
        await svc.removeFrom(store, uid, 'alerts', id);
        return { ok: true };
      }),
    },
    goals: resource(
      (s, uid, input, c) => svc.createGoal(s, uid, input, c),
      (s, uid, id, input) => svc.updateGoal(s, uid, id, input),
      (s, uid, id) => svc.removeFrom(s, uid, 'goals', id),
    ),
    notifications: {
      markRead: run(async (uid) => {
        await svc.markNotificationsRead(store, uid);
        return { ok: true };
      }),
    },
    account: {
      reset: run(async (uid, c) => {
        await svc.resetUser(store, uid, c);
        return { ok: true };
      }),
    },
    admin: {
      users: checkUsers(async () => {
        admin();
        const out = [];
        for (const u of users()) out.push({ ...publicUser(u), transactions: (await store.list('transactions', u.id)).length });
        return out;
      }),
      updateUser: checkUsers(async (id, input) => {
        const actor = admin();
        const list = users();
        const target = list.find((u) => u.id === id);
        if (!target) throw new ApiError('User not found.', 404);
        const self = target.id === actor.id;
        const changes = [];
        if (input.role !== undefined) {
          if (!['user', 'admin'].includes(input.role)) throw new ValidationError('Role must be user or admin.', 'role');
          if (self && input.role !== 'admin') throw new ValidationError('You cannot remove your own admin role.');
          if (input.role !== target.role) changes.push(`role ${target.role} -> ${input.role}`);
          target.role = input.role;
        }
        if (input.active !== undefined) {
          if (self && !input.active) throw new ValidationError('You cannot deactivate your own account.');
          if (Boolean(input.active) !== target.active) changes.push(input.active ? 'activated' : 'deactivated');
          target.active = Boolean(input.active);
        }
        saveUsers(list);
        if (changes.length) log(actor, 'user.update', target.email, changes.join(', '));
        return publicUser(target);
      }),
      deleteUser: checkUsers(async (id) => {
        const actor = admin();
        const target = users().find((u) => u.id === id);
        if (!target) throw new ApiError('User not found.', 404);
        if (target.id === actor.id) throw new ValidationError('You cannot delete your own account.');
        saveUsers(users().filter((u) => u.id !== id));
        storage.removeItem(DATA_PREFIX + id);
        store.forget(id);
        log(actor, 'user.delete', target.email);
        return { ok: true };
      }),
      settings: checkUsers(async () => {
        admin();
        return { settings: settings(), market: { provider: null, configured: false, cached: 0, lastError: '' } };
      }),
      saveSettings: checkUsers(async (input) => {
        const actor = admin();
        const current = settings();
        const next = normalizeSettings(input, current);
        put(SETTINGS_KEY, next);
        const diff = Object.keys(next).filter((k) => next[k] !== current[k]).map((k) => `${k}=${next[k]}`).join(', ');
        log(actor, 'settings.update', '', diff || 'no change');
        return { settings: next, market: { provider: null, configured: false, cached: 0, lastError: '' } };
      }),
      audit: checkUsers(async () => {
        admin();
        return get(AUDIT_KEY) || [];
      }),
      stats: checkUsers(async () => {
        admin();
        let portfolios = 0;
        let transactions = 0;
        let openOrders = 0;
        for (const u of users()) {
          portfolios += (await store.list('portfolios', u.id)).length;
          transactions += (await store.list('transactions', u.id)).length;
          openOrders += (await store.list('orders', u.id, { status: 'open' })).length;
        }
        return { users: users().length, admins: users().filter((u) => u.role === 'admin').length, stocks: catalogue.length, portfolios, transactions, openOrders, market: { provider: null, configured: false } };
      }),
    },
    async resetDemo() {
      await sleep();
      users().forEach((u) => store.forget(u.id));
      const doomed = [];
      for (let i = 0; i < storage.length; i += 1) {
        const k = storage.key(i);
        if (k && k.startsWith('smp:')) doomed.push(k);
      }
      doomed.forEach((k) => storage.removeItem(k));
      await ensureSeeded();
    },
  };
}
