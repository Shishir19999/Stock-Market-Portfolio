import { beforeEach, describe, expect, it } from 'vitest';
import catalogue from '@shared/data/stocks.json';
import { benchmarkSeries, dailySeries, generateHistory, quoteAt, sampleNews, simulatedQuotes, sliceDays, sliceRange } from '@shared/market.js';
import { parseCsv, parseTransactionsCsv, toCsv, csvCell } from '@shared/csv.js';
import { DEFAULT_SETTINGS, ValidationError, normalizeCredentials, normalizeGoal, normalizeOrder, normalizeSettings, normalizeTransaction } from '@shared/validate.js';
import { createMemoryStore } from '@shared/memoryStore.js';
import * as svc from '@shared/service.js';
import { replay } from '@shared/finance.js';

const NOW = Date.parse('2026-10-07T15:00:00Z');
const symbols = new Set(catalogue.map((s) => s.symbol));
let store;
let quotes;
let settings;
const ctx = () => ({ settings, now: () => NOW, quotes, symbols });
const U = 'u1';

beforeEach(async () => {
  store = createMemoryStore();
  settings = { ...DEFAULT_SETTINGS, commission: 1 };
  quotes = simulatedQuotes(catalogue, NOW);
  await svc.initUser(store, U, ctx());
});

describe('market simulator', () => {
  it('is deterministic and keeps prices near the base', () => {
    const s = catalogue.find((x) => x.symbol === 'MSFT');
    expect(quoteAt(s, NOW)).toBe(quoteAt(s, NOW));
    for (let i = 0; i < 200; i += 1) {
      const p = quoteAt(s, NOW + i * 3000);
      expect(Math.abs(p / s.initial_price - 1)).toBeLessThan(0.016);
    }
  });
  it('ticks: prices change within a minute', () => {
    const s = catalogue.find((x) => x.symbol === 'KO');
    const seen = new Set(Array.from({ length: 20 }, (_, i) => quoteAt(s, NOW + i * 3000)));
    expect(seen.size).toBeGreaterThan(3);
  });
  it('builds consistent daily candles ending at the current price', () => {
    const s = catalogue.find((x) => x.symbol === 'JPM');
    const d = dailySeries(s, NOW);
    expect(d.length).toBeGreaterThan(700);
    expect(d.at(-1).c).toBe(s.initial_price);
    for (const c of d) {
      expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c) - 1e-9);
      expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c) + 1e-9);
      expect([0, 6]).not.toContain(new Date(c.t).getUTCDay());
    }
    expect(dailySeries(s, NOW)).toBe(dailySeries(s, NOW));
    expect(sliceDays(d, '1M', NOW).length).toBeLessThan(25);
  });
  it('builds a benchmark index starting at 100 and aligned with stock dates', () => {
    const b = benchmarkSeries(catalogue, NOW);
    expect(b[0].c).toBeCloseTo(100);
    expect(b).toHaveLength(dailySeries(catalogue[0], NOW).length);
  });
  it('monthly history ends at the current price and slices', () => {
    const h = generateHistory(catalogue[0], new Date(NOW));
    expect(h.at(-1).price).toBe(catalogue[0].initial_price);
    expect(sliceRange(h, '1Y', NOW).length).toBeLessThan(15);
  });
  it('generates sample headlines for the biggest movers', () => {
    const news = sampleNews(catalogue, quotes, NOW, 5);
    expect(news).toHaveLength(5);
    expect(news[0].text).toMatch(/\w/);
  });
});

describe('csv', () => {
  it('round-trips quoting and protects against formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(toCsv([{ a: 1 }], [{ label: 'A', value: (r) => r.a }])).toBe('A\r\n1\r\n');
  });
  it('parses a transactions file with aliases and reports bad rows', () => {
    const text = 'Date,Action,Ticker,Qty,Price,Fees\n2025-01-02,Deposit,,,,\n2025-01-03,Bought,aapl,10,$5.5,1\n2025-01-04,sell,zzz,1,1,0\nnot-a-date,buy,msft,1,1,0\n';
    const { rows, errors } = parseTransactionsCsv(text, { symbols });
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 4, 5]);
    expect(rows[0].tx).toMatchObject({ type: 'buy', symbol: 'AAPL', shares: 10, price: 5.5, fee: 1 });
  });
  it('needs a header', () => {
    expect(parseTransactionsCsv('x,y\n1,2', {}).errors[0].message).toMatch(/Missing required column/);
    expect(parseTransactionsCsv('', {}).errors).toHaveLength(1);
  });
});

describe('validation', () => {
  it('normalizes transactions and rejects bad input', () => {
    expect(normalizeTransaction({ type: 'buy', date: '2025-01-02', symbol: 'aapl', shares: '2', price: '3.456' }, { now: NOW }).amount).toBe(6.91);
    expect(() => normalizeTransaction({ type: 'buy', date: '2025-01-02', symbol: 'AAPL', shares: 0, price: 1 })).toThrow(ValidationError);
    expect(() => normalizeTransaction({ type: 'buy', date: '2999-01-02', symbol: 'AAPL', shares: 1, price: 1 }, { now: NOW })).toThrow(/future/);
    expect(() => normalizeTransaction({ type: 'x', date: '2025-01-02' })).toThrow(/Type/);
    expect(() => normalizeTransaction({ type: 'deposit', date: '2025-01-02', amount: -5 })).toThrow(/greater than zero/);
  });
  it('validates orders, goals, settings and credentials', () => {
    expect(normalizeOrder({ symbol: 'AAPL', side: 'buy', type: 'limit', shares: 3, limitPrice: '1.5' })).toMatchObject({ limitPrice: 1.5 });
    expect(() => normalizeOrder({ symbol: 'AAPL', side: 'buy', type: 'stop', shares: 3 })).toThrow(/stop price/);
    expect(() => normalizeOrder({ symbol: 'AAPL', side: 'buy', shares: 1.5 })).toThrow(/whole number/);
    expect(normalizeGoal({ name: 'House', target: 5000, deadline: '2030-01-01' }).deadline).toBe('2030-01-01');
    expect(() => normalizeSettings({ refreshSeconds: 1 })).toThrow(/between 3 and 300/);
    expect(normalizeSettings({ commission: '2.5' }).commission).toBe(2.5);
    expect(() => normalizeCredentials({ email: 'a@b.co', password: 'short', name: 'Al' }, { signup: true })).toThrow(/at least 8/);
    expect(normalizeCredentials({ email: ' A@B.CO ', password: 'x' }).email).toBe('a@b.co');
  });
});

describe('service: portfolios and transactions', () => {
  it('creates defaults with starting cash', async () => {
    const data = await svc.loadAll(store, U, ctx());
    expect(data.portfolios).toHaveLength(1);
    expect(replay(data.transactions).cash).toBe(25000);
    expect(data.watchlists).toHaveLength(1);
  });
  it('validates the ledger on add, import and delete', async () => {
    const pf = (await svc.loadAll(store, U, ctx())).portfolios[0];
    const base = { portfolioId: pf.id, date: '2026-09-01' };
    await svc.addTransaction(store, U, { ...base, date: '2026-08-01', type: 'deposit', amount: 1000 }, ctx());
    await expect(svc.addTransaction(store, U, { ...base, type: 'buy', symbol: 'AAPL', shares: 1e6, price: 1 }, ctx())).rejects.toThrow(/Not enough cash/);
    await expect(svc.addTransaction(store, U, { ...base, type: 'sell', symbol: 'AAPL', shares: 1, price: 1 }, ctx())).rejects.toThrow(/do not own/);
    const buy = await svc.addTransaction(store, U, { ...base, type: 'buy', symbol: 'MSFT', shares: 10, price: 20 }, ctx());
    await svc.addTransaction(store, U, { ...base, date: '2026-09-10', type: 'sell', symbol: 'MSFT', shares: 4, price: 25 }, ctx());
    await expect(svc.deleteTransaction(store, U, buy.id)).rejects.toThrow(/later activity/);
    const res = await svc.importTransactions(store, U, pf.id, [{ ...base, type: 'dividend', symbol: 'MSFT', amount: 5 }], ctx());
    expect(res.imported).toBe(1);
    await expect(svc.importTransactions(store, U, pf.id, [{ ...base, type: 'bogus' }], ctx())).rejects.toThrow(/Row 1/);
    await expect(svc.addTransaction(store, U, { ...base, portfolioId: 'nope', type: 'deposit', amount: 5 }, ctx())).rejects.toThrow(/not found/);
  });
  it('limits and deletes portfolios with their data', async () => {
    const first = (await svc.loadAll(store, U, ctx())).portfolios[0];
    const second = await svc.createPortfolio(store, U, { name: 'Retirement', method: 'AVG', startingCash: 500 }, ctx());
    expect(second.method).toBe('AVG');
    await svc.createGoal(store, U, { name: 'g', target: 100, portfolioId: second.id }, ctx());
    await svc.deletePortfolio(store, U, second.id);
    const data = await svc.loadAll(store, U, ctx());
    expect(data.transactions.every((t) => t.portfolioId === first.id)).toBe(true);
    expect(data.goals[0].portfolioId).toBe('all');
    await expect(svc.deletePortfolio(store, U, first.id)).rejects.toThrow(/at least one/);
    await expect(svc.createPortfolio(store, U, { name: '' }, ctx())).rejects.toThrow(/Name/);
  });
});

describe('service: orders and alerts', () => {
  it('fills market orders immediately with the commission', async () => {
    const pf = (await svc.loadAll(store, U, ctx())).portfolios[0];
    const price = quotes.MSFT.price;
    const { order, tx } = await svc.placeOrder(store, U, { portfolioId: pf.id, symbol: 'MSFT', side: 'buy', type: 'market', shares: 10 }, ctx());
    expect(order.status).toBe('filled');
    expect(tx).toMatchObject({ price, fee: 1, shares: 10 });
    const r = replay((await svc.loadAll(store, U, ctx())).transactions);
    expect(r.cash).toBeCloseTo(25000 - 10 * price - 1);
    await expect(svc.placeOrder(store, U, { portfolioId: pf.id, symbol: 'MSFT', side: 'sell', type: 'market', shares: 11 }, ctx())).rejects.toThrow(/only own 10/);
    await expect(svc.placeOrder(store, U, { portfolioId: pf.id, symbol: 'MSFT', side: 'buy', type: 'market', shares: 1e7 }, ctx())).rejects.toThrow(/Not enough cash/);
  });
  it('keeps limit orders open until the price allows, then fills on sync', async () => {
    const pf = (await svc.loadAll(store, U, ctx())).portfolios[0];
    const price = quotes.KO.price;
    const { order } = await svc.placeOrder(store, U, { portfolioId: pf.id, symbol: 'KO', side: 'buy', type: 'limit', shares: 5, limitPrice: price - 5 }, ctx());
    expect(order.status).toBe('open');
    expect((await svc.sync(store, U, ctx())).fills).toHaveLength(0);
    quotes = { ...quotes, KO: { price: price - 6, prev: price } };
    const ev = await svc.sync(store, U, ctx());
    expect(ev.fills).toHaveLength(1);
    const data = await svc.loadAll(store, U, ctx());
    expect(data.orders[0]).toMatchObject({ status: 'filled', fillPrice: price - 6 });
    expect(data.notifications[0].text).toMatch(/Order filled/);
    expect(data.transactions.some((t) => t.type === 'buy' && t.symbol === 'KO')).toBe(true);
  });
  it('rejects an unaffordable pending order and supports cancel and stop orders', async () => {
    const pf = (await svc.loadAll(store, U, ctx())).portfolios[0];
    const price = quotes.GS.price;
    const { order } = await svc.placeOrder(store, U, { portfolioId: pf.id, symbol: 'GS', side: 'buy', type: 'stop', shares: 1e6, stopPrice: price - 1 }, ctx());
    const ev = await svc.sync(store, U, ctx());
    expect(ev.rejected).toHaveLength(1);
    expect((await svc.loadAll(store, U, ctx())).orders.find((o) => o.id === order.id).status).toBe('rejected');
    const open = (await svc.placeOrder(store, U, { portfolioId: pf.id, symbol: 'GS', side: 'buy', type: 'limit', shares: 1, limitPrice: 1 }, ctx())).order;
    expect((await svc.cancelOrder(store, U, open.id)).status).toBe('cancelled');
    await expect(svc.cancelOrder(store, U, open.id)).rejects.toThrow(/open orders/);
  });
  it('fires price alerts once and notifies', async () => {
    const price = quotes.NFLX.price;
    await svc.createAlert(store, U, { symbol: 'NFLX', direction: 'above', target: price - 1 }, ctx());
    await expect(svc.createAlert(store, U, { symbol: 'ZZZZ', direction: 'above', target: 1 }, ctx())).rejects.toThrow(/Unknown/);
    expect((await svc.sync(store, U, ctx())).triggered).toHaveLength(1);
    expect((await svc.sync(store, U, ctx())).triggered).toHaveLength(0);
    const data = await svc.loadAll(store, U, ctx());
    expect(data.notifications).toHaveLength(1);
    await svc.markNotificationsRead(store, U);
    expect((await svc.loadAll(store, U, ctx())).notifications.every((n) => n.read)).toBe(true);
  });
});

describe('service: watchlists, goals, reset', () => {
  it('manages watchlists and goals', async () => {
    const wl = await svc.createWatchlist(store, U, { name: 'Tech', symbols: ['aapl', 'MSFT', 'AAPL'] }, ctx());
    expect(wl.symbols).toEqual(['AAPL', 'MSFT']);
    expect((await svc.updateWatchlist(store, U, wl.id, { symbols: ['KO'] }, ctx())).symbols).toEqual(['KO']);
    await expect(svc.updateWatchlist(store, U, wl.id, { symbols: ['NOPE'] }, ctx())).rejects.toThrow(/Unknown/);
    await svc.removeFrom(store, U, 'watchlists', wl.id);
    await expect(svc.removeFrom(store, U, 'watchlists', wl.id)).rejects.toThrow();
    const g = await svc.createGoal(store, U, { name: 'Car', target: 9000, deadline: '2028-01-01', monthly: 100 }, ctx());
    expect((await svc.updateGoal(store, U, g.id, { name: 'Car', target: 12000 })).target).toBe(12000);
  });
  it('resets a user to a fresh account', async () => {
    await svc.createAlert(store, U, { symbol: 'KO', direction: 'above', target: 1 }, ctx());
    await svc.resetUser(store, U, ctx());
    const data = await svc.loadAll(store, U, ctx());
    expect(data.alerts).toHaveLength(0);
    expect(data.portfolios).toHaveLength(1);
  });
});
