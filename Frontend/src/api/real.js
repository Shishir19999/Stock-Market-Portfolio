// Client for the Express API. Same interface as demo.js so every page works in both modes.
import { ApiError } from './errors.js';

const TOKEN_KEY = 'smp:token';
const USER_KEY = 'smp:user';

export function createRealApi({ baseUrl, storage = globalThis.localStorage } = {}) {
  const read = (k) => {
    try {
      return storage.getItem(k);
    } catch {
      return null;
    }
  };
  const write = (k, v) => {
    try {
      if (v === null) storage.removeItem(k);
      else storage.setItem(k, v);
    } catch {
      /* storage unavailable: the session lasts until reload */
    }
  };
  let memToken = null;
  const token = () => memToken || read(TOKEN_KEY);

  async function request(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('Could not reach the server. Check that the backend is running.', 0);
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token() && !path.startsWith('/api/auth/login')) {
      memToken = null;
      write(TOKEN_KEY, null);
      write(USER_KEY, null);
      window.dispatchEvent(new Event('smp:unauthorized'));
    }
    if (!res.ok) throw new ApiError(data.error || `Request failed (HTTP ${res.status})`, res.status, data.field);
    return data;
  }
  const open = (res) => {
    memToken = res.token;
    write(TOKEN_KEY, res.token);
    write(USER_KEY, JSON.stringify(res.user));
    return res.user;
  };
  const post = (path, body = {}) => request(path, { method: 'POST', body });
  const patch = (path, body = {}) => request(path, { method: 'PATCH', body });
  const del = (path) => request(path, { method: 'DELETE' });
  const resource = (name) => ({
    create: (input) => post(`/api/${name}`, input),
    update: (id, input) => patch(`/api/${name}/${encodeURIComponent(id)}`, input),
    remove: (id) => del(`/api/${name}/${encodeURIComponent(id)}`),
  });

  return {
    mode: 'live',
    authRequired: true,
    auth: {
      session() {
        if (!token()) return null;
        try {
          return JSON.parse(read(USER_KEY));
        } catch {
          return null;
        }
      },
      login: async (email, password) => open(await post('/api/auth/login', { email, password })),
      signup: async (name, email, password) => open(await post('/api/auth/signup', { name, email, password })),
      async logout() {
        try {
          await post('/api/auth/logout');
        } catch {
          /* already signed out */
        }
        memToken = null;
        write(TOKEN_KEY, null);
        write(USER_KEY, null);
      },
    },
    stocks: {
      async all() {
        const first = await request('/api/stocks?page=1&limit=100');
        const out = [...first.data];
        for (let page = 2; page <= first.pages; page += 1) out.push(...(await request(`/api/stocks?page=${page}&limit=100`)).data);
        return out;
      },
    },
    load: () => request('/api/data'),
    sync: () => post('/api/sync'),
    portfolios: resource('portfolios'),
    transactions: {
      create: (input) => post('/api/transactions', input),
      import: (portfolioId, rows) => post('/api/transactions/import', { portfolioId, rows }),
      remove: (id) => del(`/api/transactions/${encodeURIComponent(id)}`),
    },
    orders: { place: (input) => post('/api/orders', input), cancel: (id) => del(`/api/orders/${encodeURIComponent(id)}`) },
    watchlists: resource('watchlists'),
    alerts: { create: (input) => post('/api/alerts', input), remove: (id) => del(`/api/alerts/${encodeURIComponent(id)}`) },
    goals: resource('goals'),
    notifications: { markRead: () => post('/api/notifications/read') },
    account: { reset: () => post('/api/account/reset') },
    admin: {
      users: () => request('/api/admin/users'),
      updateUser: (id, input) => patch(`/api/admin/users/${encodeURIComponent(id)}`, input),
      deleteUser: (id) => del(`/api/admin/users/${encodeURIComponent(id)}`),
      settings: () => request('/api/admin/settings'),
      saveSettings: (input) => request('/api/admin/settings', { method: 'PUT', body: input }),
      audit: () => request('/api/admin/audit?limit=200'),
      stats: () => request('/api/admin/stats'),
    },
    resetDemo: null,
  };
}
