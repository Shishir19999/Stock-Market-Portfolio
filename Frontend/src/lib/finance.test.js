import { describe, expect, it } from 'vitest';
import { allocation, applyTrade, changePct, computePortfolio, evaluateAlerts, TradeError, validateAlert } from './finance.js';

const acct = { cash: 1000, holdings: [], realized: 0 };

describe('computePortfolio', () => {
  it('computes value, P&L and totals', () => {
    const { positions, totals } = computePortfolio(
      [{ symbol: 'A', shares: 10, avgCost: 10 }, { symbol: 'B', shares: 5, avgCost: 20 }],
      { A: 12, B: 15 }, 100, { A: 11, B: 15 }, 7,
    );
    expect(positions[0]).toMatchObject({ value: 120, pl: 20, dayPl: 10 });
    expect(positions[1].pl).toBe(-25);
    expect(totals).toMatchObject({ invested: 195, cost: 200, cash: 100, total: 295, unrealized: -5, realized: 7, dayPl: 10 });
    expect(totals.unrealizedPct).toBeCloseTo(-2.5);
  });
  it('handles an empty portfolio', () => {
    const { positions, totals } = computePortfolio([], {}, 500);
    expect(positions).toEqual([]);
    expect(totals.total).toBe(500);
    expect(totals.unrealizedPct).toBe(0);
  });
});

describe('allocation', () => {
  it('sums to 100 and sorts descending', () => {
    const s = allocation([{ symbol: 'A', value: 30 }, { symbol: 'B', value: 70 }], { cash: 100 });
    expect(s.map((x) => x.label)).toEqual(['Cash', 'B', 'A']);
    expect(s.reduce((t, x) => t + x.share, 0)).toBeCloseTo(100);
  });
  it('folds the tail into Other', () => {
    const pos = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, value: 10 + i }));
    const s = allocation(pos, { maxSlices: 4 });
    expect(s).toHaveLength(4);
    expect(s[3].label).toBe('Other');
    expect(s.reduce((t, x) => t + x.share, 0)).toBeCloseTo(100);
  });
  it('returns nothing for zero value', () => {
    expect(allocation([])).toEqual([]);
  });
});

describe('applyTrade', () => {
  it('buys and averages the cost', () => {
    let { account } = applyTrade(acct, { symbol: 'A', side: 'buy', shares: 10, price: 10, id: '1', date: 'd' });
    expect(account.cash).toBe(900);
    ({ account } = applyTrade(account, { symbol: 'A', side: 'buy', shares: 10, price: 20, id: '2', date: 'd' }));
    expect(account.holdings[0]).toMatchObject({ shares: 20, avgCost: 15 });
    expect(account.cash).toBe(700);
  });
  it('sells, realizes P&L and removes empty positions', () => {
    const bought = applyTrade(acct, { symbol: 'A', side: 'buy', shares: 10, price: 10, id: '1', date: 'd' }).account;
    const { account, tx } = applyTrade(bought, { symbol: 'A', side: 'sell', shares: 10, price: 13, id: '2', date: 'd' });
    expect(tx.realized).toBe(30);
    expect(account.realized).toBe(30);
    expect(account.holdings).toEqual([]);
    expect(account.cash).toBe(1030);
  });
  it('does not mutate its input', () => {
    const copy = JSON.stringify(acct);
    applyTrade(acct, { symbol: 'A', side: 'buy', shares: 1, price: 1, id: '1', date: 'd' });
    expect(JSON.stringify(acct)).toBe(copy);
  });
  it('rejects invalid orders', () => {
    const o = { symbol: 'A', price: 10, id: '1', date: 'd' };
    expect(() => applyTrade(acct, { ...o, side: 'buy', shares: 0 })).toThrow(TradeError);
    expect(() => applyTrade(acct, { ...o, side: 'buy', shares: 1.5 })).toThrow(/whole number/);
    expect(() => applyTrade(acct, { ...o, side: 'buy', shares: 101 })).toThrow(/cash/);
    expect(() => applyTrade(acct, { ...o, side: 'sell', shares: 1 })).toThrow(/own/);
    expect(() => applyTrade(acct, { ...o, side: 'hold', shares: 1 })).toThrow(/side/);
    expect(() => applyTrade(acct, { ...o, price: NaN, side: 'buy', shares: 1 })).toThrow(/Price/);
  });
});

describe('alerts', () => {
  const alerts = [
    { id: 1, symbol: 'A', direction: 'above', target: 10, triggeredAt: null },
    { id: 2, symbol: 'A', direction: 'below', target: 5, triggeredAt: null },
    { id: 3, symbol: 'B', direction: 'above', target: 1, triggeredAt: '2020' },
    { id: 4, symbol: 'Z', direction: 'above', target: 1, triggeredAt: null },
  ];
  it('finds crossed, untriggered alerts', () => {
    expect(evaluateAlerts(alerts, { A: 10, B: 50 }).map((a) => a.id)).toEqual([1]);
    expect(evaluateAlerts(alerts, { A: 4 }).map((a) => a.id)).toEqual([2]);
  });
  it('validates input', () => {
    expect(validateAlert({ symbol: '', direction: 'above', target: 1 })).toMatch(/stock/);
    expect(validateAlert({ symbol: 'A', direction: 'x', target: 1 })).toMatch(/above or below/);
    expect(validateAlert({ symbol: 'A', direction: 'above', target: '' })).toMatch(/target/);
    expect(validateAlert({ symbol: 'A', direction: 'above', target: -2 })).toMatch(/target/);
    expect(validateAlert({ symbol: 'A', direction: 'below', target: '3.5' })).toBe('');
  });
});

it('changePct', () => {
  expect(changePct(50, 75)).toBe(50);
  expect(changePct(0, 10)).toBe(0);
});
