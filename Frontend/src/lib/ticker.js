// Simulated live ticker: small mean-reverting random steps around each stock's base price.
import { mulberry32 } from './history.js';

export function nextPrice(price, base, rng) {
  const drift = (base - price) * 0.02;
  const shock = (rng() - 0.5) * 2 * 0.006 * base;
  const next = price + drift + shock;
  return Math.max(0.01, Math.round(next * 100) / 100);
}

export function createTicker(stocks, seed = Date.now()) {
  const rng = mulberry32(seed);
  const base = Object.fromEntries(stocks.map((s) => [s.symbol, s.initial_price]));
  let prices = { ...base };
  return {
    prices: () => prices,
    tick() {
      const next = {};
      for (const sym of Object.keys(base)) next[sym] = nextPrice(prices[sym], base[sym], rng);
      prices = next;
      return prices;
    },
  };
}
