import { changePct } from './finance.js';
import { sectorOf } from '../data/sectors.js';

export const SORTS = {
  name: { label: 'Name (A–Z)', cmp: (a, b) => a.company.localeCompare(b.company) },
  symbol: { label: 'Symbol (A–Z)', cmp: (a, b) => a.symbol.localeCompare(b.symbol) },
  priceDesc: { label: 'Price (high to low)', cmp: (a, b) => b.price - a.price },
  priceAsc: { label: 'Price (low to high)', cmp: (a, b) => a.price - b.price },
  growthDesc: { label: 'Growth since 2007', cmp: (a, b) => b.growth - a.growth },
  growthAsc: { label: 'Decline since 2007', cmp: (a, b) => a.growth - b.growth },
};

/** Decorate catalogue stocks with live price, sector and growth since 2007. */
export const decorate = (stocks, prices = {}) =>
  stocks.map((s) => {
    const price = prices[s.symbol] ?? s.initial_price;
    return {
      ...s,
      price,
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
