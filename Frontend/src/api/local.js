// Browser-side account engine: cash, holdings, transactions, alerts and watchlist symbols,
// persisted per user in a Storage-like object (localStorage in the browser, a Map shim in tests).
import { applyTrade, validateAlert, round2 } from '../lib/finance.js';

export const START_CASH = 25000;

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const emptyAccount = () => ({ cash: START_CASH, holdings: [], realized: 0, transactions: [], alerts: [], watchlist: [] });

export function createLocalEngine({ storage, prefix = 'smp:account:', now = () => new Date(), uid } = {}) {
  let counter = 0;
  const newId = uid || (() => `${now().getTime().toString(36)}${(counter += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`);

  const read = (userId) => {
    try {
      const raw = storage.getItem(prefix + userId);
      return raw ? { ...emptyAccount(), ...JSON.parse(raw) } : emptyAccount();
    } catch {
      return emptyAccount();
    }
  };
  const write = (userId, acc) => {
    storage.setItem(prefix + userId, JSON.stringify(acc));
    return acc;
  };

  return {
    read,
    write,
    account: (userId) => {
      const { cash, holdings, realized } = read(userId);
      return { cash, holdings, realized };
    },
    transactions: (userId) => [...read(userId).transactions].sort((a, b) => (a.date < b.date ? 1 : -1)),
    trade(userId, order) {
      const acc = read(userId);
      const { account, tx } = applyTrade(acc, { ...order, date: order.date || now().toISOString(), id: newId() });
      write(userId, { ...account, transactions: [...acc.transactions, tx] });
      return { account: { cash: account.cash, holdings: account.holdings, realized: account.realized }, tx };
    },
    alerts: (userId) => read(userId).alerts,
    addAlert(userId, input) {
      const msg = validateAlert(input);
      if (msg) throw new ApiError(msg);
      const acc = read(userId);
      const alert = {
        id: newId(),
        symbol: input.symbol,
        direction: input.direction,
        target: round2(Number(input.target)),
        createdAt: now().toISOString(),
        triggeredAt: null,
      };
      write(userId, { ...acc, alerts: [...acc.alerts, alert] });
      return alert;
    },
    removeAlert(userId, id) {
      const acc = read(userId);
      write(userId, { ...acc, alerts: acc.alerts.filter((a) => a.id !== id) });
    },
    markAlertTriggered(userId, id) {
      const acc = read(userId);
      write(userId, {
        ...acc,
        alerts: acc.alerts.map((a) => (a.id === id ? { ...a, triggeredAt: now().toISOString() } : a)),
      });
    },
    watchlist: (userId) => read(userId).watchlist,
    addWatch(userId, symbol) {
      const acc = read(userId);
      if (acc.watchlist.includes(symbol)) throw new ApiError('Stock is already in the watchlist', 409);
      write(userId, { ...acc, watchlist: [...acc.watchlist, symbol] });
    },
    removeWatch(userId, symbol) {
      const acc = read(userId);
      if (!acc.watchlist.includes(symbol)) throw new ApiError('Not in watchlist', 404);
      write(userId, { ...acc, watchlist: acc.watchlist.filter((s) => s !== symbol) });
    },
    reset(userId) {
      storage.removeItem(prefix + userId);
    },
  };
}
