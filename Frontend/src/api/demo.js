// In-browser demo backend. Same interface as the real client (see real.js), but everything lives in
// localStorage: seeded stocks, accounts, sessions. Nothing ever leaves the visitor's browser.
import catalogue from '../data/stocks.json';
import { createLocalEngine, ApiError, memoryStorage } from './local.js';
import { applyTrade } from '../lib/finance.js';

export const DEMO_LOGINS = [
  { name: 'Demo Investor', email: 'demo@example.com', password: 'demo1234', note: 'Pre-filled portfolio, watchlist and alerts' },
  { name: 'New Investor', email: 'new@example.com', password: 'demo1234', note: 'Empty portfolio with $25,000 cash' },
];

const USERS_KEY = 'smp:users';
const SESSION_KEY = 'smp:session';
const SEEDED_KEY = 'smp:seeded:v1';

// Not security: a tiny non-cryptographic hash so plain passwords are not sitting in storage. Demo only.
const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
};

const normEmail = (e) => String(e || '').trim().toLowerCase();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// A believable starting portfolio: trades spread over the last ~90 days at slightly different prices.
const SEED_TRADES = [
  ['AAPL', 6000, 0.82, 80], ['MSFT', 300, 0.9, 74], ['NVDA', 500, 0.78, 66], ['GOOGL', 40, 0.93, 58],
  ['KO', 150, 1.04, 49], ['JPM', 120, 0.97, 41], ['AMZN', 120, 0.88, 33], ['XOM', 60, 1.06, 20], ['MSFT', 100, 0.96, 9],
];

export function seedDemoAccount(engine, userId, now = new Date()) {
  let account = { cash: 60000, holdings: [], realized: 0 };
  const transactions = [];
  SEED_TRADES.forEach(([symbol, shares, factor, daysAgo], i) => {
    const base = catalogue.find((s) => s.symbol === symbol).initial_price;
    const price = Math.round(base * factor * 100) / 100;
    const date = new Date(now.getTime() - daysAgo * 86400000).toISOString();
    const res = applyTrade(account, { symbol, side: 'buy', shares, price, date, id: `seed-${i}` });
    account = res.account;
    transactions.push(res.tx);
  });
  // One realised sale
  const k = catalogue.find((s) => s.symbol === 'KO').initial_price;
  const sale = applyTrade(account, {
    symbol: 'KO', side: 'sell', shares: 40, price: Math.round(k * 1.08 * 100) / 100,
    date: new Date(now.getTime() - 14 * 86400000).toISOString(), id: 'seed-sale',
  });
  account = sale.account;
  transactions.push(sale.tx);
  engine.write(userId, {
    ...account,
    transactions,
    watchlist: ['TSLA', 'NFLX', 'AMD', 'DIS', 'V'],
    alerts: [
      { id: 'seed-a1', symbol: 'TSLA', direction: 'above', target: round(catalogue.find((s) => s.symbol === 'TSLA').initial_price * 1.01), createdAt: now.toISOString(), triggeredAt: null },
      { id: 'seed-a2', symbol: 'NFLX', direction: 'below', target: round(catalogue.find((s) => s.symbol === 'NFLX').initial_price * 0.985), createdAt: now.toISOString(), triggeredAt: null },
    ],
  });
}
const round = (n) => Math.round(n * 100) / 100;

export function createDemoApi({ storage = globalThis.localStorage || memoryStorage(), latency = [120, 360], now = () => new Date() } = {}) {
  const engine = createLocalEngine({ storage, now });
  const sleep = () => {
    const [lo, hi] = latency;
    const ms = hi > 0 ? lo + Math.random() * (hi - lo) : 0;
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  };
  const users = () => {
    try {
      return JSON.parse(storage.getItem(USERS_KEY)) || [];
    } catch {
      return [];
    }
  };
  const saveUsers = (list) => storage.setItem(USERS_KEY, JSON.stringify(list));
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

  const ensureSeeded = () => {
    if (storage.getItem(SEEDED_KEY)) return;
    const list = DEMO_LOGINS.map((d, i) => ({ id: `demo-${i + 1}`, name: d.name, email: d.email, hash: hash(d.password) }));
    saveUsers(list);
    seedDemoAccount(engine, 'demo-1', now());
    storage.setItem(SEEDED_KEY, '1');
  };
  ensureSeeded();

  const uid = () => {
    const id = storage.getItem(SESSION_KEY);
    if (!id || !users().some((u) => u.id === id)) throw new ApiError('Please sign in again.', 401);
    return id;
  };
  const stockBySymbol = (symbol) => catalogue.find((s) => s.symbol === symbol);

  return {
    mode: 'demo',
    authRequired: true,
    auth: {
      session() {
        const id = storage.getItem(SESSION_KEY);
        const u = users().find((x) => x.id === id);
        return u ? publicUser(u) : null;
      },
      async login(email, password) {
        await sleep();
        const u = users().find((x) => x.email === normEmail(email));
        if (!u || u.hash !== hash(String(password || ''))) throw new ApiError('Incorrect email or password.', 401);
        storage.setItem(SESSION_KEY, u.id);
        return publicUser(u);
      },
      async signup(name, email, password) {
        await sleep();
        const n = String(name || '').trim();
        const e = normEmail(email);
        if (n.length < 2) throw new ApiError('Enter your name (at least 2 characters).');
        if (!EMAIL_RE.test(e)) throw new ApiError('Enter a valid email address.');
        if (String(password || '').length < 6) throw new ApiError('Password must be at least 6 characters.');
        const list = users();
        if (list.some((u) => u.email === e)) throw new ApiError('An account with this email already exists.', 409);
        const user = { id: `u-${Date.now().toString(36)}`, name: n, email: e, hash: hash(password) };
        saveUsers([...list, user]);
        storage.setItem(SESSION_KEY, user.id);
        return publicUser(user);
      },
      async logout() {
        await sleep();
        storage.removeItem(SESSION_KEY);
      },
    },
    stocks: {
      async all() {
        await sleep();
        return catalogue.map((s) => ({ ...s }));
      },
    },
    watchlist: {
      async list() {
        await sleep();
        return engine.watchlist(uid()).map(stockBySymbol).filter(Boolean).map((s) => ({ ...s }));
      },
      async add(stock) {
        await sleep();
        if (!stockBySymbol(stock.symbol)) throw new ApiError('Unknown stock.', 404);
        engine.addWatch(uid(), stock.symbol);
        return { message: 'Stock added to watchlist successfully' };
      },
      async remove(symbol) {
        await sleep();
        engine.removeWatch(uid(), symbol);
        return { message: 'Stock removed from watchlist' };
      },
    },
    account: {
      async get() {
        await sleep();
        return engine.account(uid());
      },
      async trade(order) {
        await sleep();
        if (!stockBySymbol(order.symbol)) throw new ApiError('Unknown stock.', 404);
        return engine.trade(uid(), order);
      },
      async transactions() {
        await sleep();
        return engine.transactions(uid());
      },
      async resetAccount() {
        await sleep();
        engine.reset(uid());
      },
    },
    alerts: {
      async list() {
        await sleep();
        return engine.alerts(uid());
      },
      async add(input) {
        await sleep();
        return engine.addAlert(uid(), input);
      },
      async remove(id) {
        await sleep();
        engine.removeAlert(uid(), id);
      },
      async markTriggered(id) {
        engine.markAlertTriggered(uid(), id);
      },
    },
    async resetDemo() {
      await sleep();
      const doomed = [];
      for (let i = 0; i < storage.length; i += 1) {
        const k = storage.key(i);
        if (k && k.startsWith('smp:')) doomed.push(k);
      }
      doomed.forEach((k) => storage.removeItem(k));
      ensureSeeded();
    },
  };
}
