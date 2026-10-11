// Time-series maths: technical indicators, portfolio value history, performance and risk metrics.
import { sortLedger } from './finance.js';

const DAY = 86400000;
export const TRADING_DAYS = 252;

// ---------- Indicators (arrays aligned with the input; null where undefined) ----------
export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values, n) {
  const out = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const k = 2 / (n + 1);
  let prev = values.slice(0, n).reduce((s, v) => s + v, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values, n = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i += 1) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  const at = (g, l) => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  out[n] = at(gain, loss);
  for (let i = n + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(0, d)) / n;
    loss = (loss * (n - 1) + Math.max(0, -d)) / n;
    out[i] = at(gain, loss);
  }
  return out;
}

// ---------- Returns and risk ----------
export const returns = (values) => {
  const out = [];
  for (let i = 1; i < values.length; i += 1) out.push(values[i - 1] > 0 ? values[i] / values[i - 1] - 1 : 0);
  return out;
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
export const stdev = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

/** Maximum peak-to-trough decline. Returns { maxDrawdown (negative fraction), series (drawdown per point) }. */
export function drawdown(values) {
  let peak = -Infinity;
  let worst = 0;
  const series = values.map((v) => {
    peak = Math.max(peak, v);
    const d = peak > 0 ? v / peak - 1 : 0;
    worst = Math.min(worst, d);
    return d;
  });
  return { maxDrawdown: worst, series };
}

/** Beta of `r` against `bench` return arrays of equal length. */
export function beta(r, bench) {
  const n = Math.min(r.length, bench.length);
  if (n < 2) return 0;
  const a = r.slice(-n);
  const b = bench.slice(-n);
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let varb = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (a[i] - ma) * (b[i] - mb);
    varb += (b[i] - mb) ** 2;
  }
  return varb === 0 ? 0 : cov / varb;
}

/** Risk summary for a value/index series. rf = annual risk-free rate (fraction). */
export function riskMetrics(values, { bench = null, rf = 0.02, periods = TRADING_DAYS } = {}) {
  const r = returns(values);
  const vol = stdev(r) * Math.sqrt(periods);
  const first = values[0];
  const last = values[values.length - 1];
  const totalReturn = first > 0 ? last / first - 1 : 0;
  const years = Math.max(r.length, 1) / periods;
  const cagr = first > 0 && last > 0 && r.length >= 2 ? (last / first) ** (1 / years) - 1 : 0;
  const annual = mean(r) * periods;
  return {
    days: r.length,
    totalReturn,
    cagr,
    volatility: vol,
    sharpe: vol > 0 ? (annual - rf) / vol : 0,
    maxDrawdown: drawdown(values).maxDrawdown,
    beta: bench ? beta(r, returns(bench)) : null,
    best: r.length ? Math.max(...r) : 0,
    worst: r.length ? Math.min(...r) : 0,
  };
}

// ---------- Portfolio history ----------
/**
 * Daily portfolio value from a ledger and aligned daily closes.
 * dates: [ms] trading days; closes: { SYM: [close per date index] }.
 * Returns [{ t, value, cash, flow }] starting on the first day the portfolio has value; flow = net deposits that day.
 */
export function valueHistory(txs, dates, closes) {
  const ledger = sortLedger(txs);
  const shares = {};
  let cash = 0;
  let k = 0;
  const out = [];
  for (let i = 0; i < dates.length; i += 1) {
    const end = dates[i] + DAY;
    let flow = 0;
    while (k < ledger.length && Date.parse(ledger[k].date) < end) {
      const tx = ledger[k];
      k += 1;
      const fee = Number(tx.fee) || 0;
      if (tx.type === 'deposit') {
        cash += tx.amount;
        flow += tx.amount;
      } else if (tx.type === 'withdraw') {
        cash -= tx.amount;
        flow -= tx.amount;
      } else if (tx.type === 'dividend') cash += tx.amount;
      else if (tx.type === 'buy') {
        cash -= tx.shares * tx.price + fee;
        shares[tx.symbol] = (shares[tx.symbol] || 0) + tx.shares;
      } else if (tx.type === 'sell') {
        cash += tx.shares * tx.price - fee;
        shares[tx.symbol] = (shares[tx.symbol] || 0) - tx.shares;
      }
    }
    let value = cash;
    for (const sym of Object.keys(shares)) if (shares[sym] > 1e-9 && closes[sym]) value += shares[sym] * closes[sym][i];
    if (out.length || value > 0) out.push({ t: dates[i], value, cash, flow });
  }
  return out;
}

/** Time-weighted return index (starts at 100) that ignores deposits and withdrawals. */
export function twrIndex(history) {
  const out = [];
  let idx = 100;
  history.forEach((h, i) => {
    if (i > 0) {
      const prev = history[i - 1].value;
      if (prev > 0) idx *= (h.value - h.flow) / prev;
    }
    out.push(idx);
  });
  return out;
}

/** Slice an array of {t,...} to the last `days` calendar days (0 = all). */
export function lastDays(arr, days, endT = Date.now()) {
  if (!days) return arr;
  const cut = Math.floor(endT / DAY) * DAY - days * DAY;
  const out = arr.filter((p) => p.t >= cut);
  return out.length >= 2 ? out : arr;
}

/** Screening metrics from daily candles [{ t, c, h, l }] (most recent last). */
export function stockMetrics(series) {
  const closes = series.map((p) => p.c);
  const n = closes.length;
  const last = closes[n - 1];
  const back = (days) => {
    const cut = series[n - 1].t - days * DAY;
    const p = series.find((x) => x.t >= cut) || series[0];
    return p.c > 0 ? last / p.c - 1 : 0;
  };
  const year = series.filter((p) => p.t >= series[n - 1].t - 365 * DAY);
  const hi52 = Math.max(...year.map((p) => p.h));
  const lo52 = Math.min(...year.map((p) => p.l));
  const s50 = sma(closes, 50)[n - 1];
  const s200 = sma(closes, 200)[n - 1];
  const ret = returns(closes.slice(-253));
  return {
    ret1M: back(31), ret3M: back(92), ret1Y: back(365),
    volatility: stdev(ret) * Math.sqrt(TRADING_DAYS),
    rsi: rsi(closes, 14)[n - 1],
    sma50: s50, sma200: s200,
    aboveSma50: s50 !== null && last > s50,
    aboveSma200: s200 !== null && last > s200,
    hi52, lo52, fromHigh: hi52 > 0 ? last / hi52 - 1 : 0,
    avgVolume: series.slice(-30).reduce((s, p) => s + p.v, 0) / Math.min(30, n),
  };
}
