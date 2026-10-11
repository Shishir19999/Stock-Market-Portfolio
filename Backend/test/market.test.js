import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarket } from '../lib/market.js';

const stocks = [
  { symbol: 'AAA', initial_price: 100, price_2002: 50, price_2007: 80 },
  { symbol: 'BBB', initial_price: 20, price_2002: 10, price_2007: 15 },
];

test('without a key the simulator is used and ticks over time', async () => {
  const m = createMarket({ env: {}, now: () => 1_700_000_000_000 });
  const a = await m.quotes(stocks);
  assert.equal(a.source, 'simulated');
  assert.ok(Math.abs(a.prices.AAA.price / 100 - 1) < 0.016);
  assert.equal(m.configured(), false);
  const m2 = createMarket({ env: {}, now: () => 1_700_000_090_000 });
  assert.notDeepEqual((await m2.quotes(stocks)).prices, a.prices);
});

test('with a key, provider prices are cached and failures fall back to the simulator', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('symbol=BBB')) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, json: async () => ({ c: 150.5, pc: 149 }) };
  };
  let t = 1_700_000_000_000;
  const m = createMarket({ env: { MARKET_API_KEY: 'k' }, fetchImpl, now: () => t });
  assert.equal((await m.quotes(stocks)).source, 'simulated', 'first call answers immediately from the simulator');
  await m._refresh(stocks.map((s) => s.symbol));
  const q = await m.quotes(stocks);
  assert.equal(q.source, 'mixed');
  assert.deepEqual(q.prices.AAA, { price: 150.5, prev: 149 });
  assert.ok(q.prices.BBB.price > 0 && q.prices.BBB.price < 25, 'fallback value');
  assert.match(calls[0], /token=k/);
  assert.equal((await m.quotes(stocks, { marketSource: 'simulated' })).source, 'simulated');
  t += 20 * 60_000;
  assert.notEqual((await m.quotes(stocks)).prices.AAA.price, 150.5, 'stale entries are not used');
});
