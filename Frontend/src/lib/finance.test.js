import { describe, expect, it } from 'vitest';
import {
  allocate, changePct, combine, evaluateAlerts, fillPrice, goalProgress, ledgerProblem, lotReport, projectValue, rebalance,
  replay, requiredContribution, sortLedger, valuePortfolio,
} from '@shared/finance.js';
import { beta, drawdown, ema, riskMetrics, returns, rsi, sma, twrIndex, valueHistory } from '@shared/analytics.js';

const tx = (date, type, extra = {}) => ({ id: `${date}-${type}-${extra.symbol || ''}-${extra.shares || extra.amount}`, date: `${date}T12:00:00.000Z`, type, fee: 0, ...extra });
const dep = (date, amount) => tx(date, 'deposit', { amount });
const buy = (date, symbol, shares, price, fee = 0) => tx(date, 'buy', { symbol, shares, price, fee });
const sell = (date, symbol, shares, price, fee = 0) => tx(date, 'sell', { symbol, shares, price, fee });

const ledger = [
  dep('2025-01-01', 10000),
  buy('2025-01-02', 'AAA', 10, 100),
  buy('2025-02-01', 'AAA', 10, 200),
  sell('2026-03-01', 'AAA', 5, 300),
  tx('2026-03-02', 'dividend', { symbol: 'AAA', amount: 12.5 }),
];

describe('replay: cost basis', () => {
  it('FIFO realizes the oldest lot first', () => {
    const r = replay(ledger, { method: 'FIFO' });
    expect(r.realized).toHaveLength(1);
    expect(r.realized[0]).toMatchObject({ proceeds: 1500, cost: 500, pl: 1000, term: 'long' });
    expect(r.positions[0].shares).toBe(15);
  });
  it('FIFO remaining cost is the cost of remaining lots', () => {
    const r = replay(ledger, { method: 'FIFO' });
    expect(r.positions[0].cost).toBeCloseTo(5 * 100 + 10 * 200);
    expect(r.positions[0].avgCost).toBeCloseTo(2500 / 15);
  });
  it('average cost uses the pooled price', () => {
    const r = replay(ledger, { method: 'AVG' });
    expect(r.realized[0]).toMatchObject({ cost: 750, pl: 750 });
    expect(r.positions[0].cost).toBeCloseTo(2250);
    expect(r.positions[0].avgCost).toBeCloseTo(150);
  });
  it('tracks cash, dividends and deposits', () => {
    const r = replay(ledger);
    expect(r.cash).toBeCloseTo(10000 - 1000 - 2000 + 1500 + 12.5);
    expect(r.totals).toMatchObject({ deposits: 10000, dividends: 12.5, realized: 1000, netDeposits: 10000 });
    expect(r.dividends).toHaveLength(1);
  });
  it('includes fees in cost and reduces proceeds', () => {
    const r = replay([dep('2025-01-01', 1000), buy('2025-01-02', 'A', 10, 10, 5), sell('2025-01-10', 'A', 10, 12, 5)]);
    expect(r.realized[0]).toMatchObject({ cost: 105, proceeds: 115, pl: 10, term: 'short' });
    expect(r.totals.fees).toBe(10);
    expect(r.cash).toBeCloseTo(1000 - 105 + 115);
  });
  it('lists FIFO tax lots with holding period', () => {
    const r = replay(ledger);
    const lots = lotReport(r.lots, { AAA: { price: 250 } }, Date.parse('2026-06-01T00:00:00Z'));
    expect(lots.map((l) => [l.shares, l.term])).toEqual([[5, 'long'], [10, 'long']]);
    expect(lots[0].gain).toBeCloseTo(5 * 250 - 500);
  });
  it('ignores input order and uses the date', () => {
    const shuffled = [ledger[3], ledger[1], ledger[0], ledger[2], ledger[4]];
    expect(sortLedger(shuffled).map((t) => t.type)).toEqual(['deposit', 'buy', 'buy', 'sell', 'dividend']);
    expect(replay(shuffled).realized[0].pl).toBe(1000);
  });
});

describe('ledger validation', () => {
  it('rejects overselling, overdrafts and overdrawn withdrawals', () => {
    expect(ledgerProblem([dep('2025-01-01', 100), buy('2025-01-02', 'A', 10, 20)])).toMatch(/Not enough cash/);
    expect(ledgerProblem([dep('2025-01-01', 1000), buy('2025-01-02', 'A', 1, 20), sell('2025-01-03', 'A', 2, 20)])).toMatch(/do not own/);
    expect(ledgerProblem([dep('2025-01-01', 10), tx('2025-01-02', 'withdraw', { amount: 11 })])).toMatch(/overdraw/);
    expect(ledgerProblem(ledger)).toBe('');
  });
  it('a sale before the purchase date is invalid', () => {
    expect(ledgerProblem([dep('2025-01-01', 1000), sell('2025-01-02', 'A', 1, 10), buy('2025-01-03', 'A', 1, 10)])).toMatch(/do not own/);
  });
});

describe('valuePortfolio and combine', () => {
  const quotes = { AAA: { price: 250, prev: 240 } };
  it('computes unrealized, day P&L and totals', () => {
    const { positions, totals } = valuePortfolio(replay(ledger), quotes);
    expect(positions[0]).toMatchObject({ value: 3750, dayPl: 150 });
    expect(totals.unrealized).toBeCloseTo(3750 - 2500);
    expect(totals.total).toBeCloseTo(3750 + replay(ledger).cash);
    expect(totals.gain).toBeCloseTo(totals.total - 10000);
    expect(totals.realized).toBe(1000);
  });
  it('merges portfolios', () => {
    const a = replay(ledger);
    const b = replay([dep('2025-01-01', 500), buy('2025-01-02', 'AAA', 5, 100)]);
    const c = combine([a, b]);
    expect(c.positions).toHaveLength(1);
    expect(c.positions[0].shares).toBe(20);
    expect(c.cash).toBeCloseTo(a.cash + b.cash);
    expect(c.totals.deposits).toBe(10500);
  });
  it('falls back to cost when there is no quote', () => {
    const { positions } = valuePortfolio(replay(ledger), {});
    expect(positions[0].pl).toBeCloseTo(0);
  });
});

describe('allocation', () => {
  const positions = [{ symbol: 'A', value: 30 }, { symbol: 'B', value: 70 }, { symbol: 'C', value: 100 }];
  const sectorOf = (s) => (s === 'C' ? 'Energy' : 'Tech');
  it('by holding sums to 100 and puts cash in', () => {
    const s = allocate(positions, 100, 'holding');
    expect(s[0].label).toBe('C');
    expect(s.reduce((t, x) => t + x.share, 0)).toBeCloseTo(100);
  });
  it('by sector and asset', () => {
    expect(allocate(positions, 0, 'sector', { sectorOf }).map((x) => [x.label, Math.round(x.share)]).sort()).toEqual([['Energy', 50], ['Tech', 50]]);
    expect(allocate(positions, 200, 'asset').map((x) => x.label).sort()).toEqual(['Cash', 'Stocks']);
  });
  it('folds the tail into Other and handles empty', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ symbol: `S${i}`, value: 10 + i }));
    const s = allocate(many, 0, 'holding', { maxSlices: 5 });
    expect(s).toHaveLength(5);
    expect(s.at(-1).label).toBe('Other');
    expect(allocate([], 0)).toEqual([]);
  });
});

describe('orders and alerts', () => {
  it('limit orders fill only at or better than the limit', () => {
    expect(fillPrice({ side: 'buy', type: 'limit', limitPrice: 10 }, 10.5)).toBeNull();
    expect(fillPrice({ side: 'buy', type: 'limit', limitPrice: 10 }, 9.9)).toBe(9.9);
    expect(fillPrice({ side: 'sell', type: 'limit', limitPrice: 10 }, 9.9)).toBeNull();
    expect(fillPrice({ side: 'sell', type: 'limit', limitPrice: 10 }, 10)).toBe(10);
  });
  it('stop orders trigger when price crosses the stop', () => {
    expect(fillPrice({ side: 'sell', type: 'stop', stopPrice: 90 }, 95)).toBeNull();
    expect(fillPrice({ side: 'sell', type: 'stop', stopPrice: 90 }, 89)).toBe(89);
    expect(fillPrice({ side: 'buy', type: 'stop', stopPrice: 110 }, 111)).toBe(111);
    expect(fillPrice({ side: 'buy', type: 'stop', stopPrice: 110 }, 100)).toBeNull();
    expect(fillPrice({ side: 'buy', type: 'market' }, 0)).toBeNull();
  });
  it('detects crossed alerts only once', () => {
    const alerts = [
      { id: '1', symbol: 'A', direction: 'above', target: 10, triggeredAt: null },
      { id: '2', symbol: 'A', direction: 'below', target: 5, triggeredAt: null },
      { id: '3', symbol: 'A', direction: 'above', target: 1, triggeredAt: 'x' },
    ];
    expect(evaluateAlerts(alerts, { A: { price: 10 } }).map((a) => a.id)).toEqual(['1']);
    expect(evaluateAlerts(alerts, { A: 4 }).map((a) => a.id)).toEqual(['2']);
    expect(evaluateAlerts(alerts, {})).toEqual([]);
  });
});

describe('rebalance', () => {
  const positions = [{ symbol: 'A', value: 600, price: 10 }, { symbol: 'B', value: 300, price: 30 }];
  it('suggests whole-share trades toward targets', () => {
    const rows = rebalance(positions, 100, { A: 40, B: 40 }, { A: { price: 10 }, B: { price: 30 } });
    const a = rows.find((r) => r.symbol === 'A');
    const b = rows.find((r) => r.symbol === 'B');
    expect(a).toMatchObject({ action: 'sell', shares: 20, side: 'sell' });
    expect(b).toMatchObject({ action: 'buy', shares: 3 });
    expect(a.drift).toBeCloseTo(20);
  });
  it('adds unowned targets and ignores holdings without a target', () => {
    const rows = rebalance(positions, 100, { C: 10 }, { C: { price: 5 } });
    expect(rows.map((r) => r.symbol)).toEqual(['C']);
    expect(rows[0]).toMatchObject({ action: 'buy', shares: 20 });
  });
  it('returns nothing for an empty portfolio', () => {
    expect(rebalance([], 0, { A: 50 }, {})).toEqual([]);
  });
});

describe('goals', () => {
  it('projects compound growth and solves the required contribution', () => {
    expect(projectValue(1000, 0, 12, 12)).toBeCloseTo(1000 * 1.01 ** 12);
    expect(projectValue(0, 100, 0, 10)).toBe(1000);
    const m = requiredContribution(1000, 5000, 6, 24);
    expect(projectValue(1000, m, 6, 24)).toBeCloseTo(5000, 4);
  });
  it('reports status', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(goalProgress({ target: 1000 }, 1500, now).status).toBe('achieved');
    expect(goalProgress({ target: 1000, deadline: '2025-06-01' }, 500, now).status).toBe('overdue');
    expect(goalProgress({ target: 10000, deadline: '2027-01-01', monthly: 10 }, 1000, now).status).toBe('behind');
    expect(goalProgress({ target: 10000, deadline: '2027-01-01', monthly: 1000 }, 1000, now).status).toBe('on-track');
    expect(goalProgress({ target: 1000 }, 250, now)).toMatchObject({ pct: 25, status: 'in-progress' });
  });
});

describe('indicators and risk', () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it('sma and ema', () => {
    expect(sma(v, 3).slice(0, 4)).toEqual([null, null, 2, 3]);
    expect(ema(v, 3)[2]).toBe(2);
    expect(ema(v, 3)[9]).toBeGreaterThan(8);
    expect(ema([1, 2], 5)).toEqual([null, null]);
  });
  it('rsi is 100 for a pure uptrend, 0 for a downtrend and 50 for flat', () => {
    const up = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(rsi(up, 14).at(-1)).toBe(100);
    expect(rsi([...up].reverse(), 14).at(-1)).toBe(0);
    expect(rsi(new Array(30).fill(5), 14).at(-1)).toBe(50);
    expect(rsi([1, 2, 3], 14)).toEqual([null, null, null]);
  });
  it('drawdown finds the worst peak to trough', () => {
    const d = drawdown([100, 120, 90, 110, 60, 130]);
    expect(d.maxDrawdown).toBeCloseTo(60 / 120 - 1);
    expect(d.series[2]).toBeCloseTo(-0.25);
  });
  it('volatility, sharpe and beta', () => {
    const flat = riskMetrics([100, 100, 100, 100]);
    expect(flat.volatility).toBe(0);
    expect(flat.sharpe).toBe(0);
    const vals = [100, 101, 99, 102, 104, 103];
    const m = riskMetrics(vals, { bench: vals, rf: 0 });
    expect(m.volatility).toBeGreaterThan(0);
    expect(m.beta).toBeCloseTo(1);
    expect(m.totalReturn).toBeCloseTo(0.03);
    expect(m.sharpe).toBeGreaterThan(0);
    expect(beta(returns(vals), returns(vals.map((x) => x * 2 - 100)))).toBeCloseTo(0.5, 1);
  });
});

describe('portfolio history', () => {
  const day = (n) => Date.UTC(2025, 0, n);
  const dates = [1, 2, 3, 4, 5].map(day);
  const closes = { A: [10, 10, 11, 12, 12] };
  const txs = [
    { type: 'deposit', date: new Date(day(1)).toISOString(), amount: 1000, fee: 0 },
    { type: 'buy', date: new Date(day(2) + 3600000).toISOString(), symbol: 'A', shares: 10, price: 10, fee: 0 },
    { type: 'deposit', date: new Date(day(4) + 3600000).toISOString(), amount: 500, fee: 0 },
  ];
  it('values the portfolio each day', () => {
    const h = valueHistory(txs, dates, closes);
    expect(h.map((x) => x.value)).toEqual([1000, 1000, 1010, 1520, 1520]);
    expect(h[3].flow).toBe(500);
  });
  it('time-weighted index ignores deposits', () => {
    const idx = twrIndex(valueHistory(txs, dates, closes));
    expect(idx[0]).toBe(100);
    expect(idx[2]).toBeCloseTo(101);
    expect(idx[3]).toBeCloseTo(101 * (1520 - 500) / 1010);
  });
  it('starts at the first day with value', () => {
    expect(valueHistory([{ ...txs[0], date: new Date(day(3)).toISOString() }], dates, closes)).toHaveLength(3);
  });
});

describe('misc', () => {
  it('changePct', () => {
    expect(changePct(100, 110)).toBeCloseTo(10);
    expect(changePct(0, 5)).toBe(0);
  });
});

describe('stockMetrics', () => {
  it('summarises a daily series', async () => {
    const { stockMetrics } = await import('@shared/analytics.js');
    const day = 86400000;
    const series = Array.from({ length: 300 }, (_, i) => ({ t: 1_700_000_000_000 + i * day, c: 100 + i, h: 101 + i, l: 99 + i, v: 1000 }));
    const m = stockMetrics(series);
    expect(m.ret1Y).toBeGreaterThan(0.5);
    expect(m.aboveSma50).toBe(true);
    expect(m.aboveSma200).toBe(true);
    expect(m.rsi).toBe(100);
    expect(m.fromHigh).toBeCloseTo(399 / 400 - 1);
    expect(m.avgVolume).toBe(1000);
  });
});
