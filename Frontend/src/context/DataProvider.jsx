import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataContext } from './contexts.js';
import { useToast } from './hooks.js';
import { api } from '../api/index.js';
import { combine, replay, valuePortfolio } from '@shared/finance.js';
import { dailySeries } from '@shared/market.js';
import { decorate } from '../lib/stocks.js';

const errMsg = (e) => (e && e.message) || 'Something went wrong.';
const EMPTY = { portfolios: [], transactions: [], orders: [], watchlists: [], alerts: [], goals: [], notifications: [] };
const SCOPE_KEY = 'smp:scope';
const readScope = () => {
  try {
    return localStorage.getItem(SCOPE_KEY) || 'all';
  } catch {
    return 'all';
  }
};

export default function DataProvider({ children }) {
  const toast = useToast();
  const [status, setStatus] = useState('loading'); // loading | error | ready
  const [error, setError] = useState('');
  const [stocks, setStocks] = useState([]);
  const [data, setData] = useState(EMPTY);
  const [quotes, setQuotes] = useState({ source: 'simulated', asOf: 0, prices: {} });
  const [settings, setSettings] = useState({ refreshSeconds: 5, commission: 0, startingCash: 25000, allowSignups: true, marketSource: 'auto' });
  const [scope, setScopeState] = useState(readScope);
  const [liveScale, setLiveScale] = useState({});
  const busy = useRef(false);

  const apply = useCallback((res) => {
    setData(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, res[k] || []])));
    if (res.quotes) setQuotes(res.quotes);
    if (res.settings) setSettings(res.settings);
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const [s, res] = await Promise.all([api.stocks.all(), api.load()]);
      setStocks(s);
      apply(res);
      // With a live provider the sample history is rescaled once so it ends at the real price.
      const scales = {};
      if (res.quotes?.source !== 'simulated') for (const st of s) if (res.quotes.prices[st.symbol] && st.initial_price > 0) scales[st.symbol] = res.quotes.prices[st.symbol].price / st.initial_price;
      setLiveScale(scales);
      setStatus('ready');
    } catch (e) {
      setError(errMsg(e));
      setStatus('error');
    }
  }, [apply]);

  useEffect(() => {
    // Initial load: state is already 'loading', and load only sets state after awaiting the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    apply(await api.load());
  }, [apply]);

  // Market ticks: the API fills open orders and fires alerts, then returns fresh quotes.
  useEffect(() => {
    if (status !== 'ready') return undefined;
    const ms = Math.max(3, settings.refreshSeconds || 5) * 1000;
    const id = setInterval(async () => {
      if (document.hidden || busy.current) return;
      busy.current = true;
      try {
        const res = await api.sync();
        setQuotes(res.quotes);
        if (res.settings) setSettings(res.settings);
        const { fills = [], rejected = [], triggered = [] } = res.events || {};
        if (fills.length || rejected.length || triggered.length) {
          for (const o of fills) toast.show(`Order filled: ${o.type} ${o.side} ${o.shares} ${o.symbol} at $${o.fillPrice}.`, 'success', 9000);
          for (const o of rejected) toast.error(`Order rejected: ${o.symbol}. ${o.reason}`);
          for (const a of triggered) toast.show(`Price alert: ${a.symbol} crossed ${a.direction} $${a.target}.`, 'success', 9000);
          await refresh();
        }
      } catch {
        /* a missed tick is harmless; the next one retries */
      } finally {
        busy.current = false;
      }
    }, ms);
    return () => clearInterval(id);
  }, [status, settings.refreshSeconds, toast, refresh]);

  const prices = quotes.prices;
  const catalog = useMemo(() => decorate(stocks, prices), [stocks, prices]);
  const bySymbol = useMemo(() => Object.fromEntries(catalog.map((s) => [s.symbol, s])), [catalog]);
  const symbols = useMemo(() => new Set(stocks.map((s) => s.symbol)), [stocks]);

  const scopeId = data.portfolios.some((p) => p.id === scope) ? scope : 'all';
  const setScope = useCallback((id) => {
    setScopeState(id);
    try {
      localStorage.setItem(SCOPE_KEY, id);
    } catch {
      /* not persisted */
    }
  }, []);

  // One replay per portfolio; the scoped view merges the selected ones.
  const ledgers = useMemo(
    () => Object.fromEntries(data.portfolios.map((p) => [p.id, replay(data.transactions.filter((t) => t.portfolioId === p.id), { method: p.method, strict: false })])),
    [data.portfolios, data.transactions],
  );
  const scoped = useMemo(() => (scopeId === 'all' ? data.portfolios : data.portfolios.filter((p) => p.id === scopeId)), [data.portfolios, scopeId]);
  const scopedTx = useMemo(() => data.transactions.filter((t) => scoped.some((p) => p.id === t.portfolioId)), [data.transactions, scoped]);
  const result = useMemo(() => combine(scoped.map((p) => ledgers[p.id])), [scoped, ledgers]);
  const portfolio = useMemo(() => valuePortfolio(result, prices), [result, prices]);
  const valueOf = useCallback((id) => valuePortfolio(ledgers[id] || replay([]), prices), [ledgers, prices]);

  /** Daily candles for a stock, rescaled when a live provider quote differs from the sample base price. */
  const seriesCache = useRef(new Map());
  const seriesFor = useCallback(
    (symbol) => {
      const s = stocks.find((x) => x.symbol === symbol);
      if (!s) return [];
      const base = dailySeries(s);
      const scale = liveScale[symbol] ?? 1;
      if (Math.abs(scale - 1) < 0.02) return base;
      const key = `${symbol}:${scale.toFixed(3)}:${base.length}`;
      if (!seriesCache.current.has(key)) seriesCache.current.set(key, base.map((c) => ({ ...c, o: c.o * scale, h: c.h * scale, l: c.l * scale, c: c.c * scale })));
      return seriesCache.current.get(key);
    },
    [stocks, liveScale],
  );

  // Every mutation goes through the API, then reloads the data so all views stay consistent.
  const mutate = useCallback(
    async (fn) => {
      const res = await fn();
      await refresh();
      return res;
    },
    [refresh],
  );
  const actions = useMemo(
    () => ({
      createPortfolio: (i) => mutate(() => api.portfolios.create(i)),
      updatePortfolio: (id, i) => mutate(() => api.portfolios.update(id, i)),
      deletePortfolio: (id) => mutate(() => api.portfolios.remove(id)),
      addTransaction: (i) => mutate(() => api.transactions.create(i)),
      importTransactions: (pid, rows) => mutate(() => api.transactions.import(pid, rows)),
      deleteTransaction: (id) => mutate(() => api.transactions.remove(id)),
      placeOrder: (i) => mutate(() => api.orders.place(i)),
      cancelOrder: (id) => mutate(() => api.orders.cancel(id)),
      createWatchlist: (i) => mutate(() => api.watchlists.create(i)),
      updateWatchlist: (id, i) => mutate(() => api.watchlists.update(id, i)),
      deleteWatchlist: (id) => mutate(() => api.watchlists.remove(id)),
      createAlert: (i) => mutate(() => api.alerts.create(i)),
      deleteAlert: (id) => mutate(() => api.alerts.remove(id)),
      createGoal: (i) => mutate(() => api.goals.create(i)),
      updateGoal: (id, i) => mutate(() => api.goals.update(id, i)),
      deleteGoal: (id) => mutate(() => api.goals.remove(id)),
      markNotificationsRead: () => mutate(() => api.notifications.markRead()),
      resetAccount: () => mutate(() => api.account.reset()),
    }),
    [mutate],
  );

  /** Star toggle: removes the symbol from every list that has it, otherwise adds it to the first list. */
  const toggleWatch = useCallback(
    async (symbol) => {
      const lists = data.watchlists;
      const holding = lists.filter((w) => w.symbols.includes(symbol));
      let msg;
      if (holding.length) {
        for (const w of holding) await api.watchlists.update(w.id, { symbols: w.symbols.filter((x) => x !== symbol) });
        msg = `${symbol} removed from your watchlists.`;
      } else if (lists.length) {
        await api.watchlists.update(lists[0].id, { symbols: [...lists[0].symbols, symbol] });
        msg = `${symbol} added to ${lists[0].name}.`;
      } else {
        await api.watchlists.create({ name: 'My watchlist', symbols: [symbol] });
        msg = `${symbol} added to My watchlist.`;
      }
      await refresh();
      return msg;
    },
    [data.watchlists, refresh],
  );

  const value = useMemo(
    () => ({
      toggleWatch, status, error, reload: load, refresh, stocks: catalog, bySymbol, symbols, quotes, prices, settings, ...data,
      scope: scopeId, setScope, scoped, ledgers, scopedTx, result, portfolio, valueOf, seriesFor, ...actions,
    }),
    [toggleWatch, status, error, load, refresh, catalog, bySymbol, symbols, quotes, prices, settings, data, scopeId, setScope, scoped, ledgers, scopedTx, result, portfolio, valueOf, seriesFor, actions],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
