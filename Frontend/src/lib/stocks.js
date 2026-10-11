import { changePct } from '@shared/finance.js';
import { sectorOf } from '@shared/sectors.js';

export const SORTS = {
  name: { label: 'Name (A–Z)', cmp: (a, b) => a.company.localeCompare(b.company) },
  symbol: { label: 'Symbol (A–Z)', cmp: (a, b) => a.symbol.localeCompare(b.symbol) },
  priceDesc: { label: 'Price (high to low)', cmp: (a, b) => b.price - a.price },
  priceAsc: { label: 'Price (low to high)', cmp: (a, b) => a.price - b.price },
  dayDesc: { label: 'Today (best first)', cmp: (a, b) => b.changePct - a.changePct },
  dayAsc: { label: 'Today (worst first)', cmp: (a, b) => a.changePct - b.changePct },
  growthDesc: { label: 'Growth since 2007', cmp: (a, b) => b.growth - a.growth },
  growthAsc: { label: 'Decline since 2007', cmp: (a, b) => a.growth - b.growth },
};

/** Decorate catalogue stocks with the live quote, sector, day change and growth since 2002/2007. quotes: { SYM: { price, prev } } */
export const decorate = (stocks, quotes = {}) =>
  stocks.map((s) => {
    const q = quotes[s.symbol];
    const price = q?.price ?? s.initial_price;
    const prev = q?.prev ?? price;
    return {
      ...s,
      price,
      prev,
      change: price - prev,
      changePct: changePct(prev, price),
      sector: sectorOf(s.symbol),
      growth: changePct(s.price_2007, price),
      growthSince2002: changePct(s.price_2002, price),
    };
  });

/** filters: { search, sector, trend: 'all'|'up'|'down', sort } */
export function filterStocks(stocks, { search = '', sector = 'all', trend = 'all', sort = 'name' } = {}) {
  const q = search.trim().toLowerCase();
  const out = stocks.filter((s) => {
    if (sector !== 'all' && s.sector !== sector) return false;
    if (trend === 'up' && !(s.price_2007 > s.price_2002)) return false;
    if (trend === 'down' && !(s.price_2007 < s.price_2002)) return false;
    if (!q) return true;
    return [s.company, s.symbol, s.description].some((f) => (f || '').toLowerCase().includes(q));
  });
  return out.sort((SORTS[sort] || SORTS.name).cmp);
}

export const paginate = (items, page, size) => {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { page: p, pages, total: items.length, items: items.slice((p - 1) * size, p * size) };
};

/** Screener: every criterion is optional. m = metrics from shared stockMetrics. */
export function screen(rows, c) {
  const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
  const [minP, maxP, minR, maxR, maxV, minRsi, maxRsi] = [c.minPrice, c.maxPrice, c.minRet1Y, c.maxRet1Y, c.maxVol, c.minRsi, c.maxRsi].map(num);
  return rows.filter(({ stock: s, m }) => {
    if (c.sector && c.sector !== 'all' && s.sector !== c.sector) return false;
    if (minP !== null && s.price < minP) return false;
    if (maxP !== null && s.price > maxP) return false;
    if (minR !== null && m.ret1Y * 100 < minR) return false;
    if (maxR !== null && m.ret1Y * 100 > maxR) return false;
    if (maxV !== null && m.volatility * 100 > maxV) return false;
    if (minRsi !== null && (m.rsi ?? 50) < minRsi) return false;
    if (maxRsi !== null && (m.rsi ?? 50) > maxRsi) return false;
    if (c.trend === 'above50' && !m.aboveSma50) return false;
    if (c.trend === 'below50' && m.aboveSma50) return false;
    if (c.trend === 'above200' && !m.aboveSma200) return false;
    return true;
  });
}
