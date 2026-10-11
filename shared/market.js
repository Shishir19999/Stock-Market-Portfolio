// Deterministic market simulator shared by the browser and the server.
// Everything is a pure function of (stock, time): the same inputs always give the same prices,
// so a live preview with no keys still ticks, and the server can fill orders at the same quotes.
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

export const DAY = 86400000;
export const startOfDay = (t) => Math.floor(t / DAY) * DAY;
export const roundPrice = (n) => (n < 1 ? Math.round(n * 10000) / 10000 : Math.round(n * 100) / 100);
const round = (n) => Math.round(n * 100) / 100;

// ---------- Monthly anchors (2002 -> 2007 -> today) ----------
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

/** One point per month from Jan 2002 through `now`: [{ t, price, era }]. The last point is the current price. */
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

// ---------- Live quotes ----------
const lattice = (seed, i) => {
  let h = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function valueNoise(seed, x) {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return (lattice(seed, i) * (1 - s) + lattice(seed, i + 1) * s) * 2 - 1;
}

/** Simulated price of `stock` at time t (ms). Wanders within about +/-1.5% of the stock's base price. */
export function quoteAt(stock, t) {
  const base = stock.initial_price;
  const seed = hashString(stock.symbol);
  const n = 0.4 * valueNoise(seed, t / 6000) + 0.35 * valueNoise(seed + 1, t / 90000) + 0.25 * valueNoise(seed + 2, t / 2400000);
  return Math.max(0.0001, roundPrice(base * (1 + 0.015 * n)));
}

/** { SYM: { price, prev } }, where prev is the simulated close of the previous UTC day. */
export function simulatedQuotes(stocks, t = Date.now()) {
  const out = {};
  const ref = startOfDay(t) - 1;
  for (const s of stocks) out[s.symbol] = { price: quoteAt(s, t), prev: quoteAt(s, ref) };
  return out;
}

// ---------- Daily candles ----------
const isWeekday = (t) => {
  const d = new Date(t).getUTCDay();
  return d !== 0 && d !== 6;
};
const dailyCache = new Map();

/**
 * Trading-day candles [{ t, o, h, l, c, v }] ending today (weekdays only), deterministic per symbol.
 * `days` is the number of calendar days to look back (default 3 years).
 */
export function dailySeries(stock, endT = Date.now(), days = 1100) {
  const endDay = startOfDay(endT);
  const key = `${stock.symbol}:${stock.initial_price}:${endDay}:${days}`;
  if (dailyCache.has(key)) return dailyCache.get(key);
  const monthly = generateHistory(stock, new Date(endDay));
  const logs = monthly.map((p) => Math.log(p.price));
  const seed = hashString(stock.symbol);
  const baseVol = 400000 + lattice(seed, 99) * 9000000;
  const out = [];
  let m = 0;
  let prevClose = null;
  for (let t = endDay - days * DAY; t <= endDay; t += DAY) {
    if (!isWeekday(t)) continue;
    while (m < monthly.length - 2 && monthly[m + 1].t <= t) m += 1;
    const a = monthly[m];
    const b = monthly[Math.min(m + 1, monthly.length - 1)];
    const f = b.t === a.t ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    const smooth = logs[m] + (logs[Math.min(m + 1, logs.length - 1)] - logs[m]) * f;
    const di = Math.floor(t / DAY);
    const noise = 0.014 * (0.65 * (lattice(seed + 5, di) * 2 - 1) + 0.35 * (lattice(seed + 5, di - 1) * 2 - 1));
    const close = t === endDay ? stock.initial_price : roundPrice(Math.exp(smooth + noise));
    const open = prevClose ?? close;
    const hi = roundPrice(Math.max(open, close) * (1 + lattice(seed + 6, di) * 0.008));
    const lo = roundPrice(Math.min(open, close) * (1 - lattice(seed + 7, di) * 0.008));
    out.push({ t, o: open, h: hi, l: lo, c: close, v: Math.round(baseVol * (0.6 + lattice(seed + 8, di) * 0.9)) });
    prevClose = close;
  }
  dailyCache.set(key, out);
  if (dailyCache.size > 400) dailyCache.delete(dailyCache.keys().next().value);
  return out;
}

/** Equal-weighted sample index (rebased to 100) over the whole catalogue: [{ t, c }]. */
export function benchmarkSeries(stocks, endT = Date.now(), days = 1100) {
  if (!stocks.length) return [];
  const all = stocks.map((s) => dailySeries(s, endT, days));
  const n = Math.min(...all.map((a) => a.length));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (const a of all) sum += a[a.length - n + i].c / a[a.length - n].c;
    out.push({ t: all[0][all[0].length - n + i].t, c: (sum / all.length) * 100 });
  }
  return out;
}

export const BENCHMARK_NAME = 'Sample Index (60)';

// ---------- Ranges for long monthly history ----------
export const RANGES = {
  ALL: { label: 'All' },
  EARLY: { label: '2002–2007', to: Date.UTC(2007, 0, 1) },
  LATE: { label: '2007–now', from: () => Date.UTC(2007, 0, 1) },
  '5Y': { label: '5Y', from: (now) => now - 5 * 365 * DAY },
  '1Y': { label: '1Y', from: (now) => now - 365 * DAY },
};

export function sliceRange(points, key, now = Date.now()) {
  const r = RANGES[key] || RANGES.ALL;
  const from = r.from ? r.from(now) : -Infinity;
  const to = r.to ?? Infinity;
  const out = points.filter((p) => p.t >= from && p.t <= to);
  return out.length >= 2 ? out : points;
}

/** Short ranges for daily charts, in calendar days (0 = everything). */
export const DAILY_RANGES = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '2Y': 731, ALL: 0 };
export const sliceDays = (series, key, now = Date.now()) => {
  const d = DAILY_RANGES[key] ?? 0;
  if (!d) return series;
  const cut = startOfDay(now) - d * DAY;
  const out = series.filter((p) => p.t >= cut);
  return out.length >= 2 ? out : series;
};

/** Rebase a series to 100 at its first point. */
export function rebase(points, key = 'price') {
  const base = points[0]?.[key] || 1;
  return points.map((p) => ({ ...p, [key]: (p[key] / base) * 100 }));
}

// ---------- Sample headlines (generated from the simulated moves; labelled as sample) ----------
const UP = ['{c} climbs as buyers return', '{c} edges higher on a strong session', '{c} gains ground in active trading', '{c} rallies after upbeat analyst notes'];
const DOWN = ['{c} slips as traders take profits', '{c} dips in a cautious market', '{c} under pressure after a weak session', '{c} retreats amid broader selling'];
const FLAT = ['{c} trades flat ahead of the next move', '{c} holds steady in quiet trading'];

/** Deterministic sample headlines for the biggest movers: [{ id, symbol, text, tone, chg, t }]. */
export function sampleNews(stocks, quotes, t = Date.now(), count = 8) {
  const rows = stocks
    .map((s) => {
      const q = quotes[s.symbol];
      const chg = q && q.prev > 0 ? ((q.price - q.prev) / q.prev) * 100 : 0;
      return { s, chg };
    })
    .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
    .slice(0, count);
  const hour = Math.floor(t / 3600000);
  return rows.map(({ s, chg }, i) => {
    const pool = chg > 0.15 ? UP : chg < -0.15 ? DOWN : FLAT;
    const name = s.company.replace(/,? (Inc\.|Corporation|Company|Corp\.)$/i, '');
    const text = pool[(hashString(s.symbol) + hour) % pool.length].replace('{c}', name);
    return { id: `${s.symbol}-${hour}`, symbol: s.symbol, text, tone: chg > 0.15 ? 'gain' : chg < -0.15 ? 'loss' : 'flat', chg, t: t - i * 17 * 60000 };
  });
}
