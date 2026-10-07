import { describe, expect, it } from 'vitest';
import catalogue from '../data/stocks.json';
import { decorate, filterStocks, paginate } from './stocks.js';
import { generateHistory, mulberry32, rebase, sliceRange } from './history.js';
import { createTicker, nextPrice } from './ticker.js';

const all = decorate(catalogue);

describe('stock filtering', () => {
  it('has 60 sample stocks all assigned a sector', () => {
    expect(all).toHaveLength(60);
    expect(all.some((s) => s.sector === 'Other')).toBe(false);
  });
  it('searches symbol, company and description case-insensitively', () => {
    expect(filterStocks(all, { search: 'aapl' }).map((s) => s.symbol)).toContain('AAPL');
    expect(filterStocks(all, { search: 'wireless' }).length).toBeGreaterThan(1);
    expect(filterStocks(all, { search: 'zzzzz' })).toEqual([]);
  });
  it('filters by sector and 2002-2007 trend', () => {
    expect(filterStocks(all, { sector: 'Financials' }).every((s) => s.sector === 'Financials')).toBe(true);
    expect(filterStocks(all, { trend: 'down' }).every((s) => s.price_2007 < s.price_2002)).toBe(true);
  });
  it('sorts', () => {
    const p = filterStocks(all, { sort: 'priceDesc' }).map((s) => s.price);
    expect(p).toEqual([...p].sort((a, b) => b - a));
    const n = filterStocks(all, { sort: 'name' });
    expect(n[0].company.localeCompare(n[1].company)).toBeLessThanOrEqual(0);
  });
  it('paginates and clamps', () => {
    expect(paginate(all, 1, 12)).toMatchObject({ page: 1, pages: 5, total: 60 });
    expect(paginate(all, 99, 12).page).toBe(5);
    expect(paginate([], 1, 12)).toMatchObject({ pages: 1, items: [] });
  });
});

describe('history', () => {
  const s = catalogue[0];
  const now = new Date(Date.UTC(2026, 9, 7));
  it('is deterministic and anchored on the known prices', () => {
    const a = generateHistory(s, now);
    expect(generateHistory(s, now)).toEqual(a);
    expect(a[0].price).toBe(s.price_2002);
    expect(a.find((p) => p.t === Date.UTC(2007, 0, 1)).price).toBe(s.price_2007);
    expect(a[a.length - 1].price).toBe(s.initial_price);
    expect(a.every((p, i) => i === 0 || p.t > a[i - 1].t)).toBe(true);
    expect(a.every((p) => p.price > 0)).toBe(true);
  });
  it('slices ranges and rebases to 100', () => {
    const a = generateHistory(s, now);
    expect(sliceRange(a, '1Y', now.getTime()).length).toBeLessThan(15);
    expect(sliceRange(a, 'EARLY').every((p) => p.era === 'early')).toBe(true);
    expect(rebase(a)[0].price).toBe(100);
  });
});

describe('ticker', () => {
  it('stays positive and near the base price', () => {
    const rng = mulberry32(1);
    let p = 100;
    for (let i = 0; i < 500; i += 1) p = nextPrice(p, 100, rng);
    expect(p).toBeGreaterThan(80);
    expect(p).toBeLessThan(120);
  });
  it('ticks every symbol', () => {
    const t = createTicker(catalogue, 7);
    const before = { ...t.prices() };
    const after = t.tick();
    expect(Object.keys(after)).toHaveLength(60);
    expect(after).not.toEqual(before);
  });
});
