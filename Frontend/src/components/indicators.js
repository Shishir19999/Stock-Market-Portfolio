import { ema, sma } from '@shared/analytics.js';

export const INDICATORS = {
  sma20: { label: 'SMA 20', color: 'var(--c2)', dash: undefined, calc: (c) => sma(c, 20) },
  sma50: { label: 'SMA 50', color: 'var(--c3)', dash: '6 3', calc: (c) => sma(c, 50) },
  ema20: { label: 'EMA 20', color: 'var(--c4)', dash: '2 3', calc: (c) => ema(c, 20) },
};
