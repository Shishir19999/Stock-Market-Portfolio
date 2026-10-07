// Real-backend client: stocks and watchlist come from the Express API.
// Paper-trading data (cash, holdings, transactions, alerts) has no server endpoint and is kept in this browser.
import { createLocalEngine, ApiError } from './local.js';

const LOCAL_USER = 'local';

async function request(base, path, options) {
  let res;
  try {
    res = await fetch(`${base}${path}`, options);
  } catch {
    throw new ApiError('Could not reach the server. Check that the backend is running.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (HTTP ${res.status})`, res.status);
  return data;
}

export function createRealApi({ baseUrl, storage = globalThis.localStorage } = {}) {
  const engine = createLocalEngine({ storage, prefix: 'smp:live:' });
  const uid = () => LOCAL_USER;
  return {
    mode: 'live',
    authRequired: false,
    auth: {
      session: () => ({ id: LOCAL_USER, name: 'Investor', email: '' }),
      login: async () => ({ id: LOCAL_USER, name: 'Investor', email: '' }),
      signup: async () => ({ id: LOCAL_USER, name: 'Investor', email: '' }),
      logout: async () => {},
    },
    stocks: {
      async all() {
        const first = await request(baseUrl, '/api/stocks?page=1&limit=100');
        const out = [...first.data];
        for (let page = 2; page <= first.pages; page += 1) {
          const res = await request(baseUrl, `/api/stocks?page=${page}&limit=100`);
          out.push(...res.data);
        }
        return out;
      },
    },
    watchlist: {
      list: () => request(baseUrl, '/api/watchlist'),
      add: (stock) =>
        request(baseUrl, '/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stock),
        }),
      remove: (symbol) => request(baseUrl, `/api/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
    },
    account: {
      get: async () => engine.account(uid()),
      trade: async (order) => engine.trade(uid(), order),
      transactions: async () => engine.transactions(uid()),
      resetAccount: async () => engine.reset(uid()),
    },
    alerts: {
      list: async () => engine.alerts(uid()),
      add: async (input) => engine.addAlert(uid(), input),
      remove: async (id) => engine.removeAlert(uid(), id),
      markTriggered: async (id) => engine.markAlertTriggered(uid(), id),
    },
    resetDemo: null,
  };
}
