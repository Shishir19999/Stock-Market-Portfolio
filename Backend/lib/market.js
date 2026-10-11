// Quote source for the API. Always works with no keys (deterministic simulator shared with the browser).
// If MARKET_API_KEY is set (never committed; read only from the environment) and the admin leaves the source on
// "auto", latest prices are fetched from Finnhub and cached; any symbol that fails falls back to the simulator.
import { simulatedQuotes } from '../../shared/market.js';

const TTL_MS = 60_000;
const STALE_MS = 15 * 60_000;
const BATCH = 20;

export function createMarket({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map(); // symbol -> { price, prev, at }
  let inflight = null;
  let cursor = 0;
  let lastError = '';

  const configured = () => Boolean(env.MARKET_API_KEY);

  async function refresh(symbols) {
    if (inflight) return inflight;
    const batch = [];
    for (let i = 0; i < symbols.length && batch.length < BATCH; i += 1) {
      const s = symbols[(cursor + i) % symbols.length];
      const hit = cache.get(s);
      if (!hit || now() - hit.at > TTL_MS) batch.push(s);
    }
    cursor = (cursor + BATCH) % Math.max(1, symbols.length);
    if (!batch.length) return null;
    inflight = Promise.all(
      batch.map(async (symbol) => {
        try {
          const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(env.MARKET_API_KEY)}`;
          const res = await fetchImpl(url, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const q = await res.json();
          if (q && q.c > 0) cache.set(symbol, { price: q.c, prev: q.pc > 0 ? q.pc : q.c, at: now() });
          lastError = '';
        } catch (e) {
          lastError = e.message || 'request failed';
        }
      }),
    ).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    configured,
    status: () => ({ provider: configured() ? 'finnhub' : null, configured: configured(), cached: cache.size, lastError }),
    /** Returns { source: 'simulated' | 'live' | 'mixed', asOf, prices: { SYM: { price, prev } } }. */
    async quotes(stocks, settings = {}) {
      const sim = simulatedQuotes(stocks, now());
      if (!configured() || settings.marketSource === 'simulated') return { source: 'simulated', asOf: now(), prices: sim };
      refresh(stocks.map((s) => s.symbol)).catch(() => {}); // never block the response on the provider
      let live = 0;
      const prices = {};
      for (const s of stocks) {
        const hit = cache.get(s.symbol);
        if (hit && now() - hit.at < STALE_MS) {
          prices[s.symbol] = { price: hit.price, prev: hit.prev };
          live += 1;
        } else prices[s.symbol] = sim[s.symbol];
      }
      return { source: live === 0 ? 'simulated' : live === stocks.length ? 'live' : 'mixed', asOf: now(), prices };
    },
    _refresh: refresh,
  };
}
