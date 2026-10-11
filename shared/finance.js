// Pure portfolio maths shared by the browser and the server: ledger replay with FIFO / average cost basis,
// realized and unrealized P&L, dividends, allocation, order triggers, rebalancing, goals and price alerts.
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const r2 = round2;
const DAY = 86400000;

export class LedgerError extends Error {
  constructor(message, tx) {
    super(message);
    this.name = 'LedgerError';
    this.tx = tx;
    this.status = 400;
  }
}

/** Percent change from a to b (0 when a is not a positive number). */
export const changePct = (from, to) => (from > 0 && Number.isFinite(to) ? ((to - from) / from) * 100 : 0);

export const COST_METHODS = { FIFO: 'FIFO (first in, first out)', AVG: 'Average cost' };
export const TX_TYPES = ['buy', 'sell', 'dividend', 'deposit', 'withdraw'];

const ORDER = { deposit: 0, buy: 1, dividend: 2, sell: 3, withdraw: 4 };
const ts = (tx) => Date.parse(tx.date);

/** Chronological order; same timestamp keeps deposits first and withdrawals last. Does not mutate. */
export function sortLedger(txs) {
  return txs
    .map((tx, i) => ({ tx, i }))
    .sort((a, b) => ts(a.tx) - ts(b.tx) || (ORDER[a.tx.type] ?? 9) - (ORDER[b.tx.type] ?? 9) || a.i - b.i)
    .map((x) => x.tx);
}

/**
 * Replay a ledger. tx = { id, date, type, symbol?, shares?, price?, fee?, amount? }.
 * Returns cash, open positions, FIFO tax lots, realized sales and dividends.
 * method 'FIFO' or 'AVG' decides the cost basis used for realized and unrealized P&L; lots always keep FIFO identity.
 * With strict (default) it throws LedgerError on overdrafts and selling shares that are not owned.
 */
export function replay(txs, { method = 'FIFO', strict = true } = {}) {
  let cash = 0;
  const lots = new Map(); // symbol -> [{ id, date, shares, unit, price }]
  const pool = new Map(); // symbol -> { shares, cost, firstDate }
  const realized = [];
  const dividends = [];
  const totals = { deposits: 0, withdrawals: 0, fees: 0, dividends: 0, realized: 0, bought: 0, sold: 0 };
  const fail = (msg, tx) => {
    if (strict) throw new LedgerError(msg, tx);
  };
  for (const tx of sortLedger(txs)) {
    const fee = Number(tx.fee) || 0;
    const when = ts(tx);
    if (tx.type === 'deposit') {
      cash = r2(cash + tx.amount);
      totals.deposits += tx.amount;
    } else if (tx.type === 'withdraw') {
      cash = r2(cash - tx.amount);
      totals.withdrawals += tx.amount;
      if (cash < -0.005) fail('Withdrawal would overdraw the cash balance.', tx);
    } else if (tx.type === 'dividend') {
      cash = r2(cash + tx.amount);
      totals.dividends += tx.amount;
      dividends.push({ txId: tx.id, date: tx.date, symbol: tx.symbol, amount: tx.amount });
    } else if (tx.type === 'buy') {
      const total = tx.shares * tx.price + fee;
      cash = r2(cash - total);
      totals.fees += fee;
      totals.bought += total;
      if (cash < -0.005) fail(`Not enough cash to buy ${tx.shares} ${tx.symbol} (${tx.date.slice(0, 10)}).`, tx);
      const list = lots.get(tx.symbol) || [];
      list.push({ id: tx.id, date: tx.date, shares: tx.shares, unit: total / tx.shares, price: tx.price });
      lots.set(tx.symbol, list);
      const p = pool.get(tx.symbol) || { shares: 0, cost: 0, firstDate: tx.date };
      p.shares += tx.shares;
      p.cost += total;
      pool.set(tx.symbol, p);
    } else if (tx.type === 'sell') {
      const p = pool.get(tx.symbol);
      if (!p || p.shares < tx.shares - 1e-9) {
        fail(`You do not own enough ${tx.symbol} to sell ${tx.shares} (${tx.date.slice(0, 10)}).`, tx);
        continue;
      }
      const proceeds = r2(tx.shares * tx.price - fee);
      cash = r2(cash + proceeds);
      totals.fees += fee;
      totals.sold += proceeds;
      // FIFO consumption of lots (identity), cost by chosen method
      let need = tx.shares;
      let fifoCost = 0;
      const used = [];
      const list = lots.get(tx.symbol);
      while (need > 1e-9 && list.length) {
        const lot = list[0];
        const take = Math.min(lot.shares, need);
        const c = take * lot.unit;
        used.push({ acquired: lot.date, shares: take, cost: c, term: (when - Date.parse(lot.date)) / DAY > 365 ? 'long' : 'short' });
        fifoCost += c;
        lot.shares -= take;
        need -= take;
        if (lot.shares <= 1e-9) list.shift();
      }
      const avgCost = (p.cost / p.shares) * tx.shares;
      const cost = method === 'AVG' ? avgCost : fifoCost;
      // keep the pool consistent with the chosen method
      p.cost -= cost;
      p.shares -= tx.shares;
      if (method === 'FIFO') p.cost = list.reduce((s, l) => s + l.shares * l.unit, 0);
      if (p.shares <= 1e-9) {
        pool.delete(tx.symbol);
        lots.delete(tx.symbol);
      }
      const longShares = used.filter((u) => u.term === 'long').reduce((s, u) => s + u.shares, 0);
      const pl = r2(proceeds - cost);
      totals.realized += pl;
      realized.push({
        txId: tx.id, date: tx.date, symbol: tx.symbol, shares: tx.shares, price: tx.price, proceeds, cost: r2(cost), pl,
        plPct: changePct(cost, proceeds), term: longShares >= tx.shares / 2 ? 'long' : 'short', lots: used,
      });
    }
  }
  const positions = [...pool.entries()]
    .filter(([, p]) => p.shares > 1e-9)
    .map(([symbol, p]) => ({ symbol, shares: p.shares, cost: p.cost, avgCost: p.cost / p.shares, firstDate: p.firstDate }));
  const lotList = [...lots.entries()].flatMap(([symbol, list]) => list.map((l) => ({ ...l, symbol, cost: l.shares * l.unit })));
  totals.realized = r2(totals.realized);
  totals.netDeposits = r2(totals.deposits - totals.withdrawals);
  return { method, cash, positions, lots: lotList, realized, dividends, totals };
}

/** Check a ledger is internally consistent. Returns '' or the first problem. */
export function ledgerProblem(txs, method = 'FIFO') {
  try {
    replay(txs, { method, strict: true });
    return '';
  } catch (e) {
    if (e instanceof LedgerError) return e.message;
    throw e;
  }
}

/** Merge several replay results (for the "all portfolios" view). */
export function combine(results) {
  const sum = (f) => results.reduce((s, r) => s + f(r), 0);
  const map = new Map();
  for (const r of results) {
    for (const p of r.positions) {
      const cur = map.get(p.symbol);
      if (!cur) map.set(p.symbol, { ...p });
      else {
        cur.shares += p.shares;
        cur.cost += p.cost;
        cur.avgCost = cur.cost / cur.shares;
        if (p.firstDate < cur.firstDate) cur.firstDate = p.firstDate;
      }
    }
  }
  const totals = {};
  for (const k of ['deposits', 'withdrawals', 'fees', 'dividends', 'realized', 'bought', 'sold', 'netDeposits']) totals[k] = sum((r) => r.totals[k] || 0);
  return {
    method: results.length === 1 ? results[0].method : 'MIXED',
    cash: r2(sum((r) => r.cash)),
    positions: [...map.values()],
    lots: results.flatMap((r) => r.lots),
    realized: results.flatMap((r) => r.realized).sort((a, b) => (a.date < b.date ? 1 : -1)),
    dividends: results.flatMap((r) => r.dividends).sort((a, b) => (a.date < b.date ? 1 : -1)),
    totals,
  };
}

/** Value a replay result. quotes: { SYM: { price, prev } }. */
export function valuePortfolio(result, quotes = {}) {
  const positions = result.positions.map((h) => {
    const q = quotes[h.symbol];
    const price = q?.price ?? h.avgCost;
    const prev = q?.prev ?? price;
    const value = h.shares * price;
    return {
      symbol: h.symbol, shares: h.shares, avgCost: h.avgCost, cost: h.cost, firstDate: h.firstDate,
      price, value, pl: value - h.cost, plPct: changePct(h.cost, value), dayPl: h.shares * (price - prev),
    };
  });
  const invested = positions.reduce((s, p) => s + p.value, 0);
  const cost = positions.reduce((s, p) => s + p.cost, 0);
  const dayPl = positions.reduce((s, p) => s + p.dayPl, 0);
  const total = invested + result.cash;
  const t = result.totals;
  return {
    positions,
    totals: {
      invested, cost, cash: result.cash, total, unrealized: invested - cost, unrealizedPct: changePct(cost, invested),
      realized: t.realized, dividends: t.dividends, fees: t.fees, netDeposits: t.netDeposits,
      gain: total - t.netDeposits, gainPct: changePct(t.netDeposits, total),
      dayPl, dayPlPct: changePct(invested - dayPl, invested),
    },
  };
}

/** Tax-lot report rows with current value, gain and holding period. */
export function lotReport(lots, quotes = {}, now = Date.now()) {
  return lots
    .map((l) => {
      const price = quotes[l.symbol]?.price ?? l.price;
      const days = Math.max(0, Math.floor((now - Date.parse(l.date)) / DAY));
      const value = l.shares * price;
      return {
        id: l.id, symbol: l.symbol, acquired: l.date, shares: l.shares, unitCost: l.unit, cost: l.cost, price, value,
        gain: value - l.cost, gainPct: changePct(l.cost, value), days, term: days > 365 ? 'long' : 'short',
      };
    })
    .sort((a, b) => (a.symbol === b.symbol ? (a.acquired < b.acquired ? -1 : 1) : a.symbol.localeCompare(b.symbol)));
}

/**
 * Allocation slices [{ label, value, share }] by 'holding' | 'sector' | 'asset'. Cash is its own slice.
 * Holding view folds the tail into "Other".
 */
export function allocate(positions, cash = 0, by = 'holding', { maxSlices = 7, sectorOf = () => 'Other' } = {}) {
  const items = [];
  if (by === 'asset') {
    items.push({ label: 'Stocks', value: positions.reduce((s, p) => s + p.value, 0) });
  } else if (by === 'sector') {
    const m = new Map();
    for (const p of positions) m.set(sectorOf(p.symbol), (m.get(sectorOf(p.symbol)) || 0) + p.value);
    for (const [label, value] of m) items.push({ label, value });
  } else {
    for (const p of positions) items.push({ label: p.symbol, value: p.value });
  }
  if (cash > 0) items.push({ label: 'Cash', value: cash });
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];
  items.sort((a, b) => b.value - a.value);
  let slices = items;
  if (by === 'holding' && items.length > maxSlices) {
    const head = items.slice(0, maxSlices - 1);
    const rest = items.slice(maxSlices - 1);
    slices = [...head, { label: 'Other', value: rest.reduce((s, i) => s + i.value, 0) }];
  }
  return slices.filter((s) => s.value > 0).map((s) => ({ ...s, share: (s.value / total) * 100 }));
}

/** Price (or null) at which an open order fills, given the current market price. */
export function fillPrice(order, price) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const buy = order.side === 'buy';
  if (order.type === 'limit') return (buy ? price <= order.limitPrice : price >= order.limitPrice) ? price : null;
  if (order.type === 'stop') return (buy ? price >= order.stopPrice : price <= order.stopPrice) ? price : null;
  return price;
}

/** Alerts: { id, symbol, direction: 'above'|'below', target, triggeredAt }. Returns the ones newly crossed. */
export function evaluateAlerts(alerts, prices) {
  return alerts.filter((a) => {
    if (a.triggeredAt) return false;
    const p = typeof prices[a.symbol] === 'object' ? prices[a.symbol]?.price : prices[a.symbol];
    if (!Number.isFinite(p)) return false;
    return a.direction === 'above' ? p >= a.target : p <= a.target;
  });
}

// ---------- Rebalancing ----------
/**
 * Suggest whole-share trades that move holdings toward target weights (% of total portfolio value).
 * targets: { SYM: percent }. Unlisted holdings are left alone. Returns rows sorted by absolute drift.
 */
export function rebalance(positions, cash, targets, quotes, { tolerance = 0.5 } = {}) {
  const total = positions.reduce((s, p) => s + p.value, 0) + cash;
  if (total <= 0) return [];
  const symbols = new Set([...positions.map((p) => p.symbol), ...Object.keys(targets)]);
  const rows = [];
  for (const symbol of symbols) {
    const target = Number(targets[symbol]);
    if (!Number.isFinite(target)) continue;
    const pos = positions.find((p) => p.symbol === symbol);
    const price = quotes[symbol]?.price ?? pos?.price;
    if (!price) continue;
    const value = pos?.value || 0;
    const current = (value / total) * 100;
    const diffValue = (total * target) / 100 - value;
    const shares = Math.trunc(diffValue / price);
    const drift = current - target;
    rows.push({
      symbol, current, target, drift, price, diffValue, shares: Math.abs(shares), side: shares > 0 ? 'buy' : shares < 0 ? 'sell' : 'hold',
      amount: Math.abs(shares) * price, action: Math.abs(drift) < tolerance || shares === 0 ? 'hold' : shares > 0 ? 'buy' : 'sell',
    });
  }
  return rows.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

// ---------- Goals ----------
/** Future value of `current` plus a monthly contribution at an annual return (percent), compounded monthly. */
export function projectValue(current, monthly, annualPct, months) {
  const r = annualPct / 100 / 12;
  if (months <= 0) return current;
  if (Math.abs(r) < 1e-12) return current + monthly * months;
  const g = (1 + r) ** months;
  return current * g + monthly * ((g - 1) / r);
}

/** Monthly contribution needed to reach `target` in `months` at an annual return (percent). */
export function requiredContribution(current, target, annualPct, months) {
  const r = annualPct / 100 / 12;
  const g = (1 + r) ** months;
  const annuity = Math.abs(r) < 1e-12 ? months : (g - 1) / r;
  return Math.max(0, (target - current * g) / annuity);
}

/** Progress toward a goal { target, deadline?, monthly?, returnPct? } given the current value. */
export function goalProgress(goal, current, now = Date.now()) {
  const target = Number(goal.target) || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  const months = goal.deadline ? Math.max(0, (Date.parse(goal.deadline) - now) / (DAY * 30.4375)) : null;
  const monthly = Number(goal.monthly) || 0;
  const returnPct = Number.isFinite(Number(goal.returnPct)) ? Number(goal.returnPct) : 6;
  const projected = months === null ? null : projectValue(current, monthly, returnPct, Math.floor(months));
  let status = 'in-progress';
  if (current >= target && target > 0) status = 'achieved';
  else if (months !== null && months <= 0) status = 'overdue';
  else if (projected !== null) status = projected >= target ? 'on-track' : 'behind';
  const requiredMonthly = status === 'achieved' ? 0 : months && months >= 1 ? requiredContribution(current, target, returnPct, Math.floor(months)) : remaining;
  return { pct, remaining, months, projected, status, requiredMonthly };
}
