// Input validation shared by the API and the browser-only backend. All functions return a clean value or throw ValidationError.
import { TX_TYPES, round2 } from './finance.js';

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.status = 400;
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
export const PASSWORD_MIN = 8;

const bad = (message, field) => {
  throw new ValidationError(message, field);
};
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const decimals = (n, max) => Math.abs(n * 10 ** max - Math.round(n * 10 ** max)) < 1e-6;

export function normalizeSymbol(v, field = 'symbol') {
  const s = str(v).toUpperCase();
  if (!SYMBOL_RE.test(s)) bad('Enter a valid ticker symbol.', field);
  return s;
}

/** Accepts YYYY-MM-DD or a full ISO timestamp; returns an ISO string. */
export function normalizeDate(v, field = 'date', { now = Date.now() } = {}) {
  const s = str(v);
  if (!s) bad('Enter a date.', field);
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T12:00:00.000Z`) : Date.parse(s);
  if (!Number.isFinite(t) || t < Date.UTC(1990, 0, 1)) bad('Enter a valid date (YYYY-MM-DD).', field);
  if (t > now + 86400000 * 2) bad('The date cannot be in the future.', field);
  return new Date(t).toISOString();
}

export function normalizeTransaction(input, { symbols = null, now = Date.now() } = {}) {
  const type = str(input.type).toLowerCase();
  if (!TX_TYPES.includes(type)) bad(`Type must be one of: ${TX_TYPES.join(', ')}.`, 'type');
  const tx = { type, date: normalizeDate(input.date, 'date', { now }), fee: 0, note: str(input.note).slice(0, 200) };
  if (type === 'buy' || type === 'sell') {
    tx.symbol = normalizeSymbol(input.symbol);
    const shares = num(input.shares);
    const price = num(input.price);
    const fee = input.fee === undefined || input.fee === '' || input.fee === null ? 0 : num(input.fee);
    if (!Number.isFinite(shares) || shares <= 0 || shares > 1e9) bad('Shares must be a number greater than zero.', 'shares');
    if (!decimals(shares, 4)) bad('Shares can have at most 4 decimal places.', 'shares');
    if (!Number.isFinite(price) || price <= 0 || price > 1e7) bad('Price must be greater than zero.', 'price');
    if (!Number.isFinite(fee) || fee < 0 || fee > 1e6) bad('Fee cannot be negative.', 'fee');
    Object.assign(tx, { shares, price, fee: round2(fee), amount: round2(shares * price) });
  } else if (type === 'dividend') {
    tx.symbol = normalizeSymbol(input.symbol);
    const amount = num(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) bad('Dividend amount must be greater than zero.', 'amount');
    tx.amount = round2(amount);
  } else {
    const amount = num(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) bad('Amount must be greater than zero.', 'amount');
    tx.amount = round2(amount);
  }
  if (tx.symbol && symbols && !symbols.has(tx.symbol)) bad(`Unknown stock ${tx.symbol}.`, 'symbol');
  return tx;
}

export const METHODS = ['FIFO', 'AVG'];

export function normalizePortfolio(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.name !== undefined) {
    const name = str(input.name);
    if (name.length < 1 || name.length > 40) bad('Name must be 1 to 40 characters.', 'name');
    out.name = name;
  }
  if (!partial || input.method !== undefined) {
    const method = str(input.method || 'FIFO').toUpperCase();
    if (!METHODS.includes(method)) bad('Cost basis method must be FIFO or AVG.', 'method');
    out.method = method;
  }
  if (input.targets !== undefined) {
    const t = input.targets;
    if (!t || typeof t !== 'object' || Array.isArray(t)) bad('Targets must be an object of symbol to percent.', 'targets');
    const clean = {};
    let sum = 0;
    for (const [k, v] of Object.entries(t)) {
      const n = num(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) bad(`Target for ${k} must be between 0 and 100.`, 'targets');
      if (n > 0) clean[normalizeSymbol(k, 'targets')] = round2(n);
      sum += n;
    }
    if (sum > 100.01) bad('Target weights add up to more than 100%.', 'targets');
    out.targets = clean;
  }
  return out;
}

export function normalizeOrder(input, { symbols = null } = {}) {
  const side = str(input.side).toLowerCase();
  const type = str(input.type || 'market').toLowerCase();
  if (side !== 'buy' && side !== 'sell') bad('Order side must be buy or sell.', 'side');
  if (!['market', 'limit', 'stop'].includes(type)) bad('Order type must be market, limit or stop.', 'type');
  const symbol = normalizeSymbol(input.symbol);
  if (symbols && !symbols.has(symbol)) bad(`Unknown stock ${symbol}.`, 'symbol');
  const shares = num(input.shares);
  if (!Number.isInteger(shares) || shares <= 0 || shares > 1e8) bad('Enter a whole number of shares greater than zero.', 'shares');
  const out = { symbol, side, type, shares };
  if (type === 'limit') {
    const p = num(input.limitPrice);
    if (!Number.isFinite(p) || p <= 0) bad('Enter a limit price greater than zero.', 'limitPrice');
    out.limitPrice = round2(p);
  }
  if (type === 'stop') {
    const p = num(input.stopPrice);
    if (!Number.isFinite(p) || p <= 0) bad('Enter a stop price greater than zero.', 'stopPrice');
    out.stopPrice = round2(p);
  }
  return out;
}

export function normalizeAlert(input) {
  const symbol = normalizeSymbol(input.symbol);
  const direction = str(input.direction);
  if (direction !== 'above' && direction !== 'below') bad('Choose above or below.', 'direction');
  const target = num(input.target);
  if (!Number.isFinite(target) || target <= 0) bad('Enter a target price greater than zero.', 'target');
  return { symbol, direction, target: round2(target) };
}

export function normalizeWatchlist(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.name !== undefined) {
    const name = str(input.name);
    if (name.length < 1 || name.length > 40) bad('Name must be 1 to 40 characters.', 'name');
    out.name = name;
  }
  if (!partial || input.symbols !== undefined) {
    if (!Array.isArray(input.symbols ?? [])) bad('Symbols must be a list.', 'symbols');
    out.symbols = [...new Set((input.symbols ?? []).map((s) => normalizeSymbol(s, 'symbols')))].slice(0, 100);
  }
  return out;
}

export function normalizeGoal(input) {
  const name = str(input.name);
  if (name.length < 1 || name.length > 60) bad('Name must be 1 to 60 characters.', 'name');
  const target = num(input.target);
  if (!Number.isFinite(target) || target <= 0 || target > 1e12) bad('Target amount must be greater than zero.', 'target');
  const out = { name, target: round2(target), portfolioId: str(input.portfolioId) || 'all', deadline: null, monthly: 0, returnPct: 6 };
  if (str(input.deadline)) {
    const t = Date.parse(`${str(input.deadline).slice(0, 10)}T12:00:00.000Z`);
    if (!Number.isFinite(t)) bad('Enter a valid deadline (YYYY-MM-DD).', 'deadline');
    out.deadline = new Date(t).toISOString().slice(0, 10);
  }
  if (input.monthly !== undefined && input.monthly !== '') {
    const m = num(input.monthly);
    if (!Number.isFinite(m) || m < 0 || m > 1e9) bad('Monthly contribution cannot be negative.', 'monthly');
    out.monthly = round2(m);
  }
  if (input.returnPct !== undefined && input.returnPct !== '') {
    const r = num(input.returnPct);
    if (!Number.isFinite(r) || r < -20 || r > 30) bad('Expected return must be between -20% and 30%.', 'returnPct');
    out.returnPct = r;
  }
  return out;
}

export const DEFAULT_SETTINGS = { allowSignups: true, startingCash: 25000, commission: 0, marketSource: 'auto', refreshSeconds: 5 };

export function normalizeSettings(input, current = DEFAULT_SETTINGS) {
  const out = { ...current };
  if (input.allowSignups !== undefined) out.allowSignups = Boolean(input.allowSignups);
  if (input.startingCash !== undefined) {
    const n = num(input.startingCash);
    if (!Number.isFinite(n) || n < 0 || n > 1e8) bad('Starting cash must be between 0 and 100,000,000.', 'startingCash');
    out.startingCash = round2(n);
  }
  if (input.commission !== undefined) {
    const n = num(input.commission);
    if (!Number.isFinite(n) || n < 0 || n > 1000) bad('Commission must be between 0 and 1,000.', 'commission');
    out.commission = round2(n);
  }
  if (input.marketSource !== undefined) {
    if (!['auto', 'simulated'].includes(input.marketSource)) bad('Market source must be auto or simulated.', 'marketSource');
    out.marketSource = input.marketSource;
  }
  if (input.refreshSeconds !== undefined) {
    const n = num(input.refreshSeconds);
    if (!Number.isInteger(n) || n < 3 || n > 300) bad('Refresh interval must be a whole number between 3 and 300 seconds.', 'refreshSeconds');
    out.refreshSeconds = n;
  }
  return out;
}

export function normalizeCredentials(input, { signup = false } = {}) {
  const email = str(input.email).toLowerCase();
  if (!EMAIL_RE.test(email)) bad('Enter a valid email address.', 'email');
  const password = typeof input.password === 'string' ? input.password : '';
  if (!password) bad('Enter your password.', 'password');
  const out = { email, password };
  if (signup) {
    const name = str(input.name);
    if (name.length < 2 || name.length > 60) bad('Enter your name (2 to 60 characters).', 'name');
    if (password.length < PASSWORD_MIN) bad(`Password must be at least ${PASSWORD_MIN} characters.`, 'password');
    if (password.length > 200) bad('Password is too long.', 'password');
    out.name = name;
  }
  return out;
}
