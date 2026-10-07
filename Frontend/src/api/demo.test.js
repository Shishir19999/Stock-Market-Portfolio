import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoApi, DEMO_LOGINS } from './demo.js';
import { memoryStorage } from './local.js';

let storage;
let api;
const demo = DEMO_LOGINS[0];
const fresh = () => createDemoApi({ storage, latency: [0, 0], now: () => new Date('2026-10-07T12:00:00Z') });

beforeEach(() => {
  storage = memoryStorage();
  api = fresh();
});

describe('demo auth', () => {
  it('rejects bad credentials and accepts the documented logins', async () => {
    await expect(api.auth.login(demo.email, 'wrong')).rejects.toThrow(/Incorrect/);
    await expect(api.auth.login('nobody@example.com', 'demo1234')).rejects.toThrow(/Incorrect/);
    expect(api.auth.session()).toBeNull();
    const u = await api.auth.login(demo.email.toUpperCase(), demo.password);
    expect(u.email).toBe(demo.email);
    expect(api.auth.session().id).toBe(u.id);
    await api.auth.logout();
    expect(api.auth.session()).toBeNull();
  });
  it('requires a session for data calls', async () => {
    await expect(api.account.get()).rejects.toThrow(/sign in/);
  });
  it('signs up with validation and rejects duplicates', async () => {
    await expect(api.auth.signup('A', 'a@example.com', 'secret1')).rejects.toThrow(/name/);
    await expect(api.auth.signup('Ann', 'bad', 'secret1')).rejects.toThrow(/email/);
    await expect(api.auth.signup('Ann', 'ann@example.com', '123')).rejects.toThrow(/6 characters/);
    const u = await api.auth.signup('Ann', 'ann@example.com', 'secret1');
    expect(u.name).toBe('Ann');
    await expect(api.auth.signup('Ann', 'ANN@example.com', 'secret1')).rejects.toThrow(/exists/);
    expect((await api.account.get()).cash).toBe(25000);
  });
});

describe('demo data', () => {
  beforeEach(async () => {
    await api.auth.login(demo.email, demo.password);
  });
  it('seeds a portfolio, transactions, watchlist and alerts', async () => {
    const acc = await api.account.get();
    expect(acc.holdings.length).toBeGreaterThan(5);
    expect(acc.cash).toBeGreaterThan(0);
    const tx = await api.account.transactions();
    expect(tx.length).toBeGreaterThan(5);
    expect(tx[0].date >= tx[tx.length - 1].date).toBe(true);
    expect((await api.watchlist.list()).length).toBe(5);
    expect((await api.alerts.list()).length).toBe(2);
    expect((await api.stocks.all()).length).toBe(60);
  });
  it('persists trades across instances (same storage)', async () => {
    const before = await api.account.get();
    await api.account.trade({ symbol: 'AAPL', side: 'buy', shares: 10, price: 1 });
    const again = fresh();
    const after = await again.account.get();
    expect(after.cash).toBe(Math.round((before.cash - 10) * 100) / 100);
    expect((await again.account.transactions())[0]).toMatchObject({ symbol: 'AAPL', side: 'buy', shares: 10 });
  });
  it('rejects overdraft and overselling', async () => {
    await expect(api.account.trade({ symbol: 'AAPL', side: 'buy', shares: 1e9, price: 1 })).rejects.toThrow(/cash/);
    await expect(api.account.trade({ symbol: 'TSLA', side: 'sell', shares: 1, price: 3 })).rejects.toThrow(/own/);
    await expect(api.account.trade({ symbol: 'NOPE', side: 'buy', shares: 1, price: 3 })).rejects.toThrow(/Unknown/);
  });
  it('manages the watchlist', async () => {
    await api.watchlist.add({ symbol: 'GM' });
    await expect(api.watchlist.add({ symbol: 'GM' })).rejects.toThrow(/already/);
    await api.watchlist.remove('GM');
    await expect(api.watchlist.remove('GM')).rejects.toThrow(/Not in/);
  });
  it('manages alerts', async () => {
    await expect(api.alerts.add({ symbol: 'AAPL', direction: 'above', target: 0 })).rejects.toThrow(/target/);
    const a = await api.alerts.add({ symbol: 'AAPL', direction: 'above', target: '2.5' });
    expect(a.target).toBe(2.5);
    await api.alerts.markTriggered(a.id);
    expect((await api.alerts.list()).find((x) => x.id === a.id).triggeredAt).toBeTruthy();
    await api.alerts.remove(a.id);
    expect((await api.alerts.list()).some((x) => x.id === a.id)).toBe(false);
  });
  it('resets all demo data', async () => {
    await api.account.trade({ symbol: 'AAPL', side: 'buy', shares: 10, price: 1 });
    await api.auth.signup('Ann', 'ann@example.com', 'secret1');
    await api.resetDemo();
    expect(api.auth.session()).toBeNull();
    await expect(api.auth.login('ann@example.com', 'secret1')).rejects.toThrow();
    await api.auth.login(demo.email, demo.password);
    expect((await api.account.transactions()).some((t) => t.shares === 10 && t.symbol === 'AAPL' && t.price === 1)).toBe(false);
  });
});
