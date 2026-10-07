import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataContext } from './contexts.js';
import { useToast } from './hooks.js';
import { api, IS_DEMO } from '../api/index.js';
import { computePortfolio, evaluateAlerts } from '../lib/finance.js';
import { decorate } from '../lib/stocks.js';
import { createTicker } from '../lib/ticker.js';
import { money } from '../lib/format.js';

const TICK_MS = 3000;
const errMsg = (e) => (e && e.message) || 'Something went wrong.';

export default function DataProvider({ children }) {
  const toast = useToast();
  const [status, setStatus] = useState('loading'); // loading | error | ready
  const [error, setError] = useState('');
  const [stocks, setStocks] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [account, setAccount] = useState({ cash: 0, holdings: [], realized: 0 });
  const [transactions, setTransactions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [prices, setPrices] = useState({});
  const tickerRef = useRef(null);
  const alertsRef = useRef([]);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const fetchAll = useCallback(async () => {
    try {
      const [s, w, a, t, al] = await Promise.all([
        api.stocks.all(),
        api.watchlist.list(),
        api.account.get(),
        api.account.transactions(),
        api.alerts.list(),
      ]);
      tickerRef.current = createTicker(s);
      setStocks(s);
      setPrices(tickerRef.current.prices());
      setWatchlist(w);
      setAccount(a);
      setTransactions(t);
      setAlerts(al);
      setStatus('ready');
    } catch (e) {
      setError(errMsg(e));
      setStatus('error');
    }
  }, []);

  const load = useCallback(() => {
    setStatus('loading');
    setError('');
    return fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    // Initial load: state is already 'loading', and fetchAll only sets state after awaiting the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll();
  }, [fetchAll]);

  // Simulated live prices (demo only). Pauses while the tab is hidden.
  useEffect(() => {
    if (!IS_DEMO || status !== 'ready') return undefined;
    const id = setInterval(() => {
      if (document.hidden || !tickerRef.current) return;
      const next = tickerRef.current.tick();
      setPrices(next);
      for (const a of evaluateAlerts(alertsRef.current, next)) {
        const stamp = new Date().toISOString();
        alertsRef.current = alertsRef.current.map((x) => (x.id === a.id ? { ...x, triggeredAt: stamp } : x));
        setAlerts(alertsRef.current);
        api.alerts.markTriggered(a.id).catch(() => {});
        toast.show(`Price alert: ${a.symbol} is ${a.direction} ${money(a.target)} (now ${money(next[a.symbol])}).`, 'success', 9000);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [status, toast]);

  const catalog = useMemo(() => decorate(stocks, prices), [stocks, prices]);
  const bySymbol = useMemo(() => Object.fromEntries(catalog.map((s) => [s.symbol, s])), [catalog]);
  const opens = useMemo(() => Object.fromEntries(stocks.map((s) => [s.symbol, s.initial_price])), [stocks]);
  const portfolio = useMemo(
    () => computePortfolio(account.holdings, prices, account.cash, opens, account.realized),
    [account, prices, opens],
  );
  const watchSet = useMemo(() => new Set(watchlist.map((w) => w.symbol)), [watchlist]);

  const addToWatchlist = useCallback(
    async (stock) => {
      try {
        const res = await api.watchlist.add(stock);
        setWatchlist((w) => (w.some((x) => x.symbol === stock.symbol) ? w : [...w, stock]));
        toast.success(res.message || `${stock.symbol} added to your watchlist.`);
      } catch (e) {
        toast.error(errMsg(e));
      }
    },
    [toast],
  );

  const removeFromWatchlist = useCallback(
    async (symbol) => {
      try {
        await api.watchlist.remove(symbol);
        setWatchlist((w) => w.filter((x) => x.symbol !== symbol));
        toast.success(`${symbol} removed from your watchlist.`);
      } catch (e) {
        toast.error(errMsg(e));
      }
    },
    [toast],
  );

  const trade = useCallback(async (order) => {
    const res = await api.account.trade(order); // errors surface to the form
    setAccount(res.account);
    setTransactions((t) => [res.tx, ...t]);
    return res.tx;
  }, []);

  const addAlert = useCallback(async (input) => {
    const a = await api.alerts.add(input);
    setAlerts((x) => [...x, a]);
    return a;
  }, []);

  const removeAlert = useCallback(
    async (id) => {
      try {
        await api.alerts.remove(id);
        setAlerts((x) => x.filter((a) => a.id !== id));
      } catch (e) {
        toast.error(errMsg(e));
      }
    },
    [toast],
  );

  const resetAccount = useCallback(async () => {
    await api.account.resetAccount();
    await load();
  }, [load]);

  const value = useMemo(
    () => ({
      status, error, reload: load, stocks: catalog, bySymbol, prices, watchlist, watchSet, account, portfolio,
      transactions, alerts, addToWatchlist, removeFromWatchlist, trade, addAlert, removeAlert, resetAccount,
    }),
    [status, error, load, catalog, bySymbol, prices, watchlist, watchSet, account, portfolio, transactions, alerts,
      addToWatchlist, removeFromWatchlist, trade, addAlert, removeAlert, resetAccount],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
