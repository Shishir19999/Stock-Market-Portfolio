// Pure portfolio maths: positions, P&L, allocation, paper-trade application, alerts.
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round2 = r2;

export class TradeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TradeError';
  }
}

/** Percent change from a to b (0 when a is not a positive number). */
export const changePct = (from, to) => (from > 0 && Number.isFinite(to) ? ((to - from) / from) * 100 : 0);

/**
 * Build positions and totals.
 * holdings: [{symbol, shares, avgCost}]; prices: {SYM: live}; opens: {SYM: reference price for "today"}.
 */
export function computePortfolio(holdings, prices, cash = 0, opens = {}, realized = 0) {
  const positions = holdings
    .filter((h) => h.shares > 0)
    .map((h) => {
      const price = prices[h.symbol] ?? h.avgCost;
      const open = opens[h.symbol] ?? price;
      const cost = h.shares * h.avgCost;
      const value = h.shares * price;
      return {
        symbol: h.symbol,
        shares: h.shares,
        avgCost: h.avgCost,
        price,
        cost,
        value,
        pl: value - cost,
        plPct: changePct(cost, value),
        dayPl: h.shares * (price - open),
      };
    });
  const invested = positions.reduce((s, p) => s + p.value, 0);
  const cost = positions.reduce((s, p) => s + p.cost, 0);
  const dayPl = positions.reduce((s, p) => s + p.dayPl, 0);
  const total = invested + cash;
  return {
    positions,
    totals: {
      invested,
      cost,
      cash,
      total,
      unrealized: invested - cost,
      unrealizedPct: changePct(cost, invested),
      realized,
      dayPl,
      dayPlPct: changePct(invested - dayPl, invested),
    },
  };
}

/** Allocation slices (share of total value), largest first, the tail folded into "Other". */
export function allocation(positions, { maxSlices = 7, cash = null } = {}) {
  const items = positions.map((p) => ({ label: p.symbol, value: p.value }));
  if (cash && cash > 0) items.push({ label: 'Cash', value: cash });
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];
  items.sort((a, b) => b.value - a.value);
  let slices = items;
  if (items.length > maxSlices) {
    const head = items.slice(0, maxSlices - 1);
    const rest = items.slice(maxSlices - 1);
    slices = [...head, { label: 'Other', value: rest.reduce((s, i) => s + i.value, 0) }];
  }
  return slices.map((s) => ({ ...s, share: (s.value / total) * 100 }));
}

/**
 * Apply a market order to an account {cash, holdings, realized}. Returns { account, tx } without mutating input.
 * Throws TradeError for invalid orders (no shorting, no overdraft).
 */
export function applyTrade(account, { symbol, side, shares, price, date, id }) {
  if (side !== 'buy' && side !== 'sell') throw new TradeError('Order side must be buy or sell.');
  if (!Number.isInteger(shares) || shares <= 0) throw new TradeError('Enter a whole number of shares greater than zero.');
  if (!Number.isFinite(price) || price <= 0) throw new TradeError('Price is not available for this stock.');
  const amount = r2(shares * price);
  const holdings = account.holdings.map((h) => ({ ...h }));
  const idx = holdings.findIndex((h) => h.symbol === symbol);
  let cash = account.cash;
  let realizedDelta = 0;
  if (side === 'buy') {
    if (amount > cash + 1e-9) throw new TradeError('Not enough cash for this order.');
    cash = r2(cash - amount);
    if (idx === -1) holdings.push({ symbol, shares, avgCost: price });
    else {
      const h = holdings[idx];
      const newShares = h.shares + shares;
      h.avgCost = (h.shares * h.avgCost + shares * price) / newShares;
      h.shares = newShares;
    }
  } else {
    if (idx === -1 || holdings[idx].shares < shares) throw new TradeError('You do not own enough shares to sell.');
    cash = r2(cash + amount);
    realizedDelta = r2((price - holdings[idx].avgCost) * shares);
    holdings[idx].shares -= shares;
  }
  const next = {
    ...account,
    cash,
    holdings: holdings.filter((h) => h.shares > 0),
    realized: r2((account.realized || 0) + realizedDelta),
  };
  const tx = { id, date, symbol, side, shares, price, amount, realized: side === 'sell' ? realizedDelta : null };
  return { account: next, tx };
}

/** Alerts: { id, symbol, direction: 'above'|'below', target, triggeredAt }. Returns the ones newly crossed. */
export function evaluateAlerts(alerts, prices) {
  return alerts.filter((a) => {
    if (a.triggeredAt) return false;
    const p = prices[a.symbol];
    if (!Number.isFinite(p)) return false;
    return a.direction === 'above' ? p >= a.target : p <= a.target;
  });
}

/** Validate alert form input; returns an error string or ''. */
export function validateAlert({ symbol, direction, target }) {
  if (!symbol) return 'Choose a stock.';
  if (direction !== 'above' && direction !== 'below') return 'Choose above or below.';
  const t = Number(target);
  if (target === '' || target === null || target === undefined || !Number.isFinite(t) || t <= 0) {
    return 'Enter a target price greater than zero.';
  }
  return '';
}
