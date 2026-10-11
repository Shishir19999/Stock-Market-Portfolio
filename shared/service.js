// Account service shared by the Express API and the browser-only backend. It owns every rule about portfolios,
// transactions, orders, alerts and goals, and talks to storage through a small async "store":
//   list(coll, uid, filter?) insert(coll, uid, doc) insertMany(coll, uid, docs) update(coll, uid, id, patch)
//   remove(coll, uid, id) removeWhere(coll, uid, filter)
// ctx = { settings, now: () => ms, quotes: { SYM: { price, prev } }, symbols: Set<string> }
import { evaluateAlerts, fillPrice, ledgerProblem, round2 } from './finance.js';
import {
  ValidationError, normalizeAlert, normalizeGoal, normalizeOrder, normalizePortfolio, normalizeTransaction, normalizeWatchlist,
} from './validate.js';

export const COLLECTIONS = ['portfolios', 'transactions', 'orders', 'watchlists', 'alerts', 'goals', 'notifications'];
export const LIMITS = { portfolios: 10, watchlists: 20, alerts: 50, goals: 20, notifications: 50, openOrders: 50 };

export class NotFoundError extends Error {
  constructor(message = 'Not found.') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

const iso = (ctx) => new Date(ctx.now()).toISOString();
const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function getPortfolio(store, uid, id) {
  const pf = (await store.list('portfolios', uid)).find((p) => p.id === id);
  if (!pf) throw new NotFoundError('Portfolio not found.');
  return pf;
}

export async function addNotification(store, uid, text, kind, ctx) {
  const n = await store.insert('notifications', uid, { text, kind, date: iso(ctx), read: false });
  const all = (await store.list('notifications', uid)).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const old of all.slice(LIMITS.notifications)) await store.remove('notifications', uid, old.id);
  return n;
}

export async function initUser(store, uid, ctx, { cash = ctx.settings.startingCash } = {}) {
  const pf = await store.insert('portfolios', uid, { name: 'Main portfolio', method: 'FIFO', targets: {}, createdAt: iso(ctx) });
  if (cash > 0) {
    await store.insert('transactions', uid, {
      portfolioId: pf.id, type: 'deposit', date: iso(ctx), amount: round2(cash), fee: 0, note: 'Starting cash',
    });
  }
  await store.insert('watchlists', uid, { name: 'My watchlist', symbols: [] });
  return pf;
}

export async function loadAll(store, uid, ctx) {
  if (!(await store.list('portfolios', uid)).length) await initUser(store, uid, ctx);
  const out = {};
  for (const c of COLLECTIONS) out[c] = await store.list(c, uid);
  out.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  out.orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  out.notifications.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}

export async function resetUser(store, uid, ctx) {
  for (const c of COLLECTIONS) await store.removeWhere(c, uid, {});
  await initUser(store, uid, ctx);
}

// ---------- Portfolios ----------
export async function createPortfolio(store, uid, input, ctx) {
  const existing = await store.list('portfolios', uid);
  if (existing.length >= LIMITS.portfolios) throw new ValidationError(`You can have at most ${LIMITS.portfolios} portfolios.`);
  const data = normalizePortfolio(input);
  const cash = input.startingCash === undefined || input.startingCash === '' ? 0 : Number(input.startingCash);
  if (!Number.isFinite(cash) || cash < 0 || cash > 1e9) throw new ValidationError('Starting cash cannot be negative.', 'startingCash');
  const pf = await store.insert('portfolios', uid, { ...data, targets: data.targets || {}, createdAt: iso(ctx) });
  if (cash > 0) {
    await store.insert('transactions', uid, { portfolioId: pf.id, type: 'deposit', date: iso(ctx), amount: round2(cash), fee: 0, note: 'Starting cash' });
  }
  return pf;
}

export async function updatePortfolio(store, uid, id, input) {
  await getPortfolio(store, uid, id);
  return store.update('portfolios', uid, id, normalizePortfolio(input, { partial: true }));
}

export async function deletePortfolio(store, uid, id) {
  const all = await store.list('portfolios', uid);
  if (!all.some((p) => p.id === id)) throw new NotFoundError('Portfolio not found.');
  if (all.length === 1) throw new ValidationError('You need at least one portfolio.');
  await store.removeWhere('transactions', uid, { portfolioId: id });
  await store.removeWhere('orders', uid, { portfolioId: id });
  for (const g of await store.list('goals', uid, { portfolioId: id })) await store.update('goals', uid, g.id, { portfolioId: 'all' });
  await store.remove('portfolios', uid, id);
}

// ---------- Transactions ----------
export async function addTransaction(store, uid, input, ctx) {
  const pf = await getPortfolio(store, uid, input.portfolioId);
  const tx = normalizeTransaction(input, { symbols: ctx.symbols, now: ctx.now() });
  const existing = await store.list('transactions', uid, { portfolioId: pf.id });
  const problem = ledgerProblem([...existing, { ...tx, id: 'new' }], pf.method);
  if (problem) throw new ValidationError(problem);
  return store.insert('transactions', uid, { ...tx, portfolioId: pf.id });
}

export async function importTransactions(store, uid, portfolioId, rawRows, ctx) {
  const pf = await getPortfolio(store, uid, portfolioId);
  if (!Array.isArray(rawRows) || !rawRows.length) throw new ValidationError('There is nothing to import.');
  if (rawRows.length > 2000) throw new ValidationError('Too many rows (maximum 2000).');
  const clean = rawRows.map((r, i) => {
    try {
      return normalizeTransaction(r, { symbols: ctx.symbols, now: ctx.now() });
    } catch (e) {
      throw new ValidationError(`Row ${i + 1}: ${e.message}`);
    }
  });
  const existing = await store.list('transactions', uid, { portfolioId: pf.id });
  const problem = ledgerProblem([...existing, ...clean.map((t, i) => ({ ...t, id: `new${i}` }))], pf.method);
  if (problem) throw new ValidationError(problem);
  await store.insertMany('transactions', uid, clean.map((t) => ({ ...t, portfolioId: pf.id, note: t.note || 'Imported' })));
  return { imported: clean.length };
}

export async function deleteTransaction(store, uid, id) {
  const tx = (await store.list('transactions', uid)).find((t) => t.id === id);
  if (!tx) throw new NotFoundError('Transaction not found.');
  const pf = await getPortfolio(store, uid, tx.portfolioId);
  const rest = (await store.list('transactions', uid, { portfolioId: pf.id })).filter((t) => t.id !== id);
  const problem = ledgerProblem(rest, pf.method);
  if (problem) throw new ValidationError(`Cannot delete this transaction because later activity depends on it. ${problem}`);
  await store.remove('transactions', uid, id);
}

// ---------- Orders ----------
async function executeFill(store, uid, order, price, pf, ctx) {
  const fee = round2(ctx.settings.commission || 0);
  const tx = {
    portfolioId: pf.id, type: order.side, date: iso(ctx), symbol: order.symbol, shares: order.shares, price,
    fee, amount: round2(order.shares * price), note: order.type === 'market' ? 'Market order' : `${order.type[0].toUpperCase()}${order.type.slice(1)} order`,
  };
  const existing = await store.list('transactions', uid, { portfolioId: pf.id });
  const problem = ledgerProblem([...existing, { ...tx, id: 'new' }], pf.method);
  if (problem) throw new ValidationError(problem);
  return store.insert('transactions', uid, tx);
}

export async function placeOrder(store, uid, input, ctx) {
  const pf = await getPortfolio(store, uid, input.portfolioId);
  const order = normalizeOrder(input, { symbols: ctx.symbols });
  const price = ctx.quotes[order.symbol]?.price;
  if (!(price > 0)) throw new ValidationError('A price is not available for this stock right now.');
  if (order.side === 'sell') {
    const owned = (await store.list('transactions', uid, { portfolioId: pf.id })).reduce(
      (s, t) => (t.symbol === order.symbol ? s + (t.type === 'buy' ? t.shares : t.type === 'sell' ? -t.shares : 0) : s), 0);
    if (order.shares > owned + 1e-9) throw new ValidationError(`You only own ${owned} shares of ${order.symbol} in this portfolio.`, 'shares');
  }
  const base = { ...order, portfolioId: pf.id, status: 'open', createdAt: iso(ctx), filledAt: null, fillPrice: null, reason: '' };
  if (order.type === 'market') {
    const tx = await executeFill(store, uid, order, price, pf, ctx);
    const saved = await store.insert('orders', uid, { ...base, status: 'filled', filledAt: iso(ctx), fillPrice: price, txId: tx.id });
    return { order: saved, tx };
  }
  const open = await store.list('orders', uid, { status: 'open' });
  if (open.length >= LIMITS.openOrders) throw new ValidationError('You have too many open orders. Cancel some first.');
  return { order: await store.insert('orders', uid, base), tx: null };
}

export async function cancelOrder(store, uid, id) {
  const order = (await store.list('orders', uid)).find((o) => o.id === id);
  if (!order) throw new NotFoundError('Order not found.');
  if (order.status !== 'open') throw new ValidationError('Only open orders can be cancelled.');
  return store.update('orders', uid, id, { status: 'cancelled', filledAt: iso({ now: () => Date.now() }) });
}

/** Fill open orders and fire price alerts against ctx.quotes. Returns { fills, rejected, triggered }. */
export async function sync(store, uid, ctx) {
  const events = { fills: [], rejected: [], triggered: [] };
  const open = await store.list('orders', uid, { status: 'open' });
  if (open.length) {
    const portfolios = await store.list('portfolios', uid);
    for (const order of open) {
      const price = fillPrice(order, ctx.quotes[order.symbol]?.price);
      if (price === null) continue;
      const pf = portfolios.find((p) => p.id === order.portfolioId);
      if (!pf) continue;
      const label = `${order.type} ${order.side} ${order.shares} ${order.symbol}`;
      try {
        const tx = await executeFill(store, uid, order, price, pf, ctx);
        const done = await store.update('orders', uid, order.id, { status: 'filled', filledAt: iso(ctx), fillPrice: price, txId: tx.id });
        await addNotification(store, uid, `Order filled: ${label} at ${money(price)}.`, 'order', ctx);
        events.fills.push(done);
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e;
        const done = await store.update('orders', uid, order.id, { status: 'rejected', reason: e.message, filledAt: iso(ctx) });
        await addNotification(store, uid, `Order rejected: ${label}. ${e.message}`, 'order', ctx);
        events.rejected.push(done);
      }
    }
  }
  const alerts = await store.list('alerts', uid);
  for (const a of evaluateAlerts(alerts, ctx.quotes)) {
    const done = await store.update('alerts', uid, a.id, { triggeredAt: iso(ctx) });
    const p = ctx.quotes[a.symbol].price;
    await addNotification(store, uid, `Price alert: ${a.symbol} is ${a.direction} ${money(a.target)} (now ${money(p)}).`, 'alert', ctx);
    events.triggered.push(done);
  }
  return events;
}

// ---------- Alerts, watchlists, goals, notifications ----------
export async function createAlert(store, uid, input, ctx) {
  const a = normalizeAlert(input);
  if (!ctx.symbols.has(a.symbol)) throw new ValidationError(`Unknown stock ${a.symbol}.`, 'symbol');
  if ((await store.list('alerts', uid)).length >= LIMITS.alerts) throw new ValidationError(`You can have at most ${LIMITS.alerts} alerts.`);
  return store.insert('alerts', uid, { ...a, createdAt: iso(ctx), triggeredAt: null });
}

export async function removeFrom(store, uid, coll, id) {
  if (!(await store.remove(coll, uid, id))) throw new NotFoundError();
}

function checkSymbols(symbols, ctx) {
  const unknown = (symbols || []).find((s) => !ctx.symbols.has(s));
  if (unknown) throw new ValidationError(`Unknown stock ${unknown}.`, 'symbols');
}

export async function createWatchlist(store, uid, input, ctx) {
  if ((await store.list('watchlists', uid)).length >= LIMITS.watchlists) throw new ValidationError(`You can have at most ${LIMITS.watchlists} watchlists.`);
  const data = normalizeWatchlist({ symbols: [], ...input });
  checkSymbols(data.symbols, ctx);
  return store.insert('watchlists', uid, data);
}

export async function updateWatchlist(store, uid, id, input, ctx) {
  const data = normalizeWatchlist(input, { partial: true });
  checkSymbols(data.symbols, ctx);
  const res = await store.update('watchlists', uid, id, data);
  if (!res) throw new NotFoundError('Watchlist not found.');
  return res;
}

export async function createGoal(store, uid, input, ctx) {
  if ((await store.list('goals', uid)).length >= LIMITS.goals) throw new ValidationError(`You can have at most ${LIMITS.goals} goals.`);
  const g = normalizeGoal(input);
  if (g.portfolioId !== 'all') await getPortfolio(store, uid, g.portfolioId);
  return store.insert('goals', uid, { ...g, createdAt: iso(ctx) });
}

export async function updateGoal(store, uid, id, input) {
  const g = normalizeGoal(input);
  if (g.portfolioId !== 'all') await getPortfolio(store, uid, g.portfolioId);
  const res = await store.update('goals', uid, id, g);
  if (!res) throw new NotFoundError('Goal not found.');
  return res;
}

export async function markNotificationsRead(store, uid) {
  for (const n of await store.list('notifications', uid, { read: false })) await store.update('notifications', uid, n.id, { read: true });
}
