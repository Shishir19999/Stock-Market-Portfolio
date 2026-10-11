import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoApi, DEMO_LOGINS } from './demo.js';
import { memoryStorage } from './errors.js';
import { replay } from '@shared/finance.js';

let storage;
let api;
const [demo, fresh, adminLogin] = DEMO_LOGINS;
const NOW = new Date('2026-10-07T12:00:00Z');
const make = () => createDemoApi({ storage, latency: [0, 0], now: () => NOW });

beforeEach(() => {
  storage = memoryStorage();
  api = make();
});

describe('demo auth and roles', () => {
  it('rejects bad credentials and accepts the documented logins', async () => {
    await expect(api.auth.login(demo.email, 'wrong-pass')).rejects.toThrow(/Incorrect/);
    await expect(api.auth.login('nobody@example.com', 'demo1234')).rejects.toThrow(/Incorrect/);
    expect(api.auth.session()).toBeNull();
    const u = await api.auth.login(demo.email.toUpperCase(), demo.password);
    expect(u).toMatchObject({ email: demo.email, role: 'user' });
    expect(api.auth.session().id).toBe(u.id);
    await api.auth.logout();
    expect(api.auth.session()).toBeNull();
    await expect(api.load()).rejects.toThrow(/sign in/);
  });
  it('signs up new users with validation and unique email', async () => {
    await expect(api.auth.signup('A', 'bad', 'pw')).rejects.toThrow();
    await expect(api.auth.signup('Sam Smith', demo.email, 'password1')).rejects.toThrow(/already exists/);
    const u = await api.auth.signup('Sam Smith', 'sam@example.com', 'password1');
    expect(u.role).toBe('user');
    const data = await api.load();
    expect(data.portfolios).toHaveLength(1);
    expect(replay(data.transactions).cash).toBe(25000);
  });
  it('keeps admin tools away from regular users', async () => {
    await api.auth.login(demo.email, demo.password);
    await expect(api.admin.users()).rejects.toMatchObject({ status: 403 });
    await expect(api.admin.saveSettings({ commission: 1 })).rejects.toMatchObject({ status: 403 });
  });
  it('lets an admin manage users, settings and see the audit log', async () => {
    await api.auth.login(adminLogin.email, adminLogin.password);
    const users = await api.admin.users();
    expect(users.map((u) => u.role).sort()).toEqual(['admin', 'user', 'user']);
    const target = users.find((u) => u.email === fresh.email);
    expect((await api.admin.updateUser(target.id, { active: false })).active).toBe(false);
    await expect(api.admin.updateUser(users.find((u) => u.role === 'admin').id, { role: 'user' })).rejects.toThrow(/own admin/);
    await expect(api.admin.saveSettings({ refreshSeconds: 0 })).rejects.toThrow(/between 3 and 300/);
    expect((await api.admin.saveSettings({ commission: 3 })).settings.commission).toBe(3);
    expect((await api.admin.audit()).map((a) => a.action)).toEqual(expect.arrayContaining(['login', 'user.update', 'settings.update']));
    await api.auth.logout();
    await expect(api.auth.login(fresh.email, fresh.password)).rejects.toThrow(/deactivated/);
    await api.auth.login(adminLogin.email, adminLogin.password);
    await api.admin.deleteUser(target.id);
    expect((await api.admin.stats()).users).toBe(2);
  });
});

describe('demo data', () => {
  it('seeds a consistent, rich account for the demo user', async () => {
    await api.auth.login(demo.email, demo.password);
    const d = await api.load();
    expect(d.portfolios).toHaveLength(2);
    for (const pf of d.portfolios) {
      const r = replay(d.transactions.filter((t) => t.portfolioId === pf.id), { method: pf.method });
      expect(r.cash).toBeGreaterThanOrEqual(0);
      expect(r.positions.length).toBeGreaterThan(2);
    }
    expect(d.watchlists).toHaveLength(2);
    expect(d.alerts.length).toBeGreaterThan(0);
    expect(d.orders.some((o) => o.status === 'open')).toBe(true);
    expect(d.goals.length).toBe(2);
    expect(d.quotes.source).toBe('simulated');
    expect(d.transactions.some((t) => t.type === 'dividend')).toBe(true);
    expect(d.transactions.some((t) => t.type === 'sell')).toBe(true);
  });
  it('places orders and persists across a reload of the api', async () => {
    await api.auth.login(fresh.email, fresh.password);
    const pf = (await api.load()).portfolios[0];
    const res = await api.orders.place({ portfolioId: pf.id, symbol: 'KO', side: 'buy', type: 'market', shares: 10 });
    expect(res.tx.shares).toBe(10);
    await expect(api.orders.place({ portfolioId: pf.id, symbol: 'KO', side: 'sell', type: 'market', shares: 50 })).rejects.toMatchObject({ status: 400 });
    const again = make();
    expect(again.auth.session().email).toBe(fresh.email);
    expect((await again.load()).transactions).toHaveLength(2);
  });
  it('resets the preview back to the seed', async () => {
    await api.auth.login(demo.email, demo.password);
    const pf = (await api.load()).portfolios[0];
    await api.portfolios.update(pf.id, { name: 'Renamed' });
    await api.resetDemo();
    expect(api.auth.session()).toBeNull();
    await api.auth.login(demo.email, demo.password);
    expect((await api.load()).portfolios[0].name).toBe('Main portfolio');
  });
  it('sync returns fresh quotes', async () => {
    await api.auth.login(demo.email, demo.password);
    const s = await api.sync();
    expect(Object.keys(s.quotes.prices)).toHaveLength(60);
    expect(s.events).toHaveProperty('fills');
  });
});
