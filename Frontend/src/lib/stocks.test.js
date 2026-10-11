import { describe, expect, it } from 'vitest';
import catalogue from '@shared/data/stocks.json';
import { SECTORS } from '@shared/sectors.js';
import { dailySeries, simulatedQuotes } from '@shared/market.js';
import { stockMetrics } from '@shared/analytics.js';
import { decorate, filterStocks, paginate, screen } from './stocks.js';

const NOW = Date.parse('2026-10-07T15:00:00Z');
const all = decorate(catalogue, simulatedQuotes(catalogue, NOW));

describe('stock filtering', () => {
  it('has 60 sample stocks all assigned a sector, with live quotes applied', () => {
    expect(all).toHaveLength(60);
    expect(all.some((s) => s.sector === 'Other')).toBe(false);
    expect(new Set(all.map((s) => s.sector))).toEqual(new Set(SECTORS));
    expect(all[0]).toHaveProperty('changePct');
    expect(all.every((s) => s.price > 0 && s.prev > 0)).toBe(true);
  });
  it('searches symbol, company and description case-insensitively', () => {
    expect(filterStocks(all, { search: 'aapl' }).map((s) => s.symbol)).toContain('AAPL');
    expect(filterStocks(all, { search: 'wireless' }).length).toBeGreaterThan(1);
    expect(filterStocks(all, { search: 'zzzzz' })).toEqual([]);
  });
  it('filters by sector and 2002-2007 trend, and sorts', () => {
    expect(filterStocks(all, { sector: 'Financials' }).every((s) => s.sector === 'Financials')).toBe(true);
    expect(filterStocks(all, { trend: 'down' }).every((s) => s.price_2007 < s.price_2002)).toBe(true);
    const p = filterStocks(all, { sort: 'priceDesc' }).map((s) => s.price);
    expect(p).toEqual([...p].sort((a, b) => b - a));
    const d = filterStocks(all, { sort: 'dayDesc' }).map((s) => s.changePct);
    expect(d).toEqual([...d].sort((a, b) => b - a));
  });
  it('paginates and clamps the page', () => {
    const pg = paginate(all, 99, 12);
    expect(pg.page).toBe(5);
    expect(pg.items).toHaveLength(12);
    expect(paginate([], 1, 12)).toMatchObject({ page: 1, pages: 1, total: 0 });
  });
});

describe('screener', () => {
  const rows = all.map((stock) => ({ stock, m: stockMetrics(dailySeries(stock, NOW)) }));
  it('returns everything with no criteria', () => {
    expect(screen(rows, {})).toHaveLength(60);
  });
  it('applies price, sector, volatility, trend and RSI filters together', () => {
    const cheap = screen(rows, { maxPrice: '25' });
    expect(cheap.every((r) => r.stock.price <= 25)).toBe(true);
    expect(cheap.length).toBeGreaterThan(0);
    const tech = screen(rows, { sector: 'Technology', trend: 'above50' });
    expect(tech.every((r) => r.stock.sector === 'Technology' && r.m.aboveSma50)).toBe(true);
    const calm = screen(rows, { maxVol: '30', minRsi: '20', maxRsi: '80' });
    expect(calm.every((r) => r.m.volatility <= 0.3 && r.m.rsi >= 20 && r.m.rsi <= 80)).toBe(true);
    expect(screen(rows, { minRet1Y: '100000' })).toEqual([]);
  });
});
