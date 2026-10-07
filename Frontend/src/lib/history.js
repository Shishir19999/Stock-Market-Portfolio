// Deterministic price history built from the three known anchors of each stock:
// price_2002 -> price_2007 -> initial_price (today). Points in between are a seeded bridge walk.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashString = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const round = (n) => Math.round(n * 100) / 100;

// Log-space bridge between two prices; noise is pinned to zero at both ends.
function bridge(from, to, steps, rng, vol) {
  const a = Math.log(from);
  const b = Math.log(to);
  const walk = [0];
  for (let i = 1; i <= steps; i += 1) walk.push(walk[i - 1] + (rng() - 0.5) * 2 * vol * Math.sqrt(1 / steps));
  const end = walk[steps];
  return walk.map((w, i) => {
    const t = i / steps;
    return Math.exp(a + (b - a) * t + (w - t * end));
  });
}

/**
 * Returns [{ t: ms, price, era }] with one point per month from Jan 2002 through `now`.
 * era: 'early' (2002-2007) or 'late' (2007-now). The last point is the current price.
 */
export function generateHistory(stock, now = new Date()) {
  const p02 = stock.price_2002 > 0 ? stock.price_2002 : stock.initial_price;
  const p07 = stock.price_2007 > 0 ? stock.price_2007 : stock.initial_price;
  const current = stock.initial_price > 0 ? stock.initial_price : p07;
  const rng = mulberry32(hashString(stock.symbol));
  const endMonths = Math.max(1, (now.getUTCFullYear() - 2007) * 12 + now.getUTCMonth());
  const early = bridge(p02, p07, 60, rng, 0.9);
  const late = bridge(p07, current, endMonths, rng, 0.8);
  const points = [];
  early.forEach((price, i) => points.push({ t: Date.UTC(2002, i, 1), price: round(price), era: 'early' }));
  late.slice(1).forEach((price, i) => points.push({ t: Date.UTC(2007, i + 1, 1), price: round(price), era: 'late' }));
  points[points.length - 1] = { t: now.getTime(), price: current, era: 'late' };
  return points;
}

export const RANGES = {
  ALL: { label: 'All' },
  EARLY: { label: '2002–2007', to: Date.UTC(2007, 0, 1) },
  LATE: { label: '2007–now', from: () => Date.UTC(2007, 0, 1) },
  '5Y': { label: '5Y', from: (now) => now - 5 * 365 * 86400000 },
  '1Y': { label: '1Y', from: (now) => now - 365 * 86400000 },
};

export function sliceRange(points, key, now = Date.now()) {
  const r = RANGES[key] || RANGES.ALL;
  const from = r.from ? r.from(now) : -Infinity;
  const to = r.to ?? Infinity;
  const out = points.filter((p) => p.t >= from && p.t <= to);
  return out.length >= 2 ? out : points;
}

/** Rebase a series to 100 at its first point (for comparisons). */
export function rebase(points) {
  const base = points[0]?.price || 1;
  return points.map((p) => ({ ...p, price: (p.price / base) * 100 }));
}
