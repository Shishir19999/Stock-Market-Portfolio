const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const money = (n) => (Number.isFinite(n) ? usd.format(n) : '—');
export const number = (n) => (Number.isFinite(n) ? num.format(n) : '—');

export const signedMoney = (n) => {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${usd.format(Math.abs(n))}`;
};

export const pct = (n, digits = 2) => {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(digits)}%`;
};

export const tone = (n) => (n > 0 ? 'gain' : n < 0 ? 'loss' : 'flat');

export const dateTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const dateOnly = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/** Fraction (0.0123) as a signed percent string. */
export const pctFrac = (f, digits = 2) => pct(f * 100, digits);
export const plainPct = (n, digits = 1) => (Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—');
export const compact = (n) => (Number.isFinite(n) ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : '—');
