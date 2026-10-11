import { useMemo } from 'react';
import { benchmarkSeries } from '@shared/market.js';
import { drawdown, lastDays, riskMetrics, twrIndex, valueHistory } from '@shared/analytics.js';
import { useData } from '../context/hooks.js';

export const PERF_RANGES = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, ALL: 0 };

/** Portfolio value, time-weighted index, benchmark and risk metrics for the current scope and range. */
export function usePerformance(rangeKey = '3M') {
  const { scopedTx, seriesFor, stocks } = useData();
  const full = useMemo(() => {
    if (!stocks.length) return null;
    const dates = seriesFor(stocks[0].symbol).map((c) => c.t);
    const held = new Set(scopedTx.filter((t) => t.type === 'buy' || t.type === 'sell').map((t) => t.symbol));
    const closes = {};
    for (const sym of held) closes[sym] = seriesFor(sym).map((c) => c.c);
    const history = valueHistory(scopedTx, dates, closes);
    const bench = benchmarkSeries(stocks);
    return { history, bench };
  }, [scopedTx, seriesFor, stocks]);

  return useMemo(() => {
    if (!full || full.history.length < 2) return null;
    const history = lastDays(full.history, PERF_RANGES[rangeKey] ?? 0);
    if (history.length < 2) return null;
    const idx = twrIndex(history);
    const benchMap = new Map(full.bench.map((b) => [b.t, b.c]));
    const b0 = benchMap.get(history[0].t) || 100;
    const benchIdx = history.map((h) => ((benchMap.get(h.t) ?? b0) / b0) * 100);
    return {
      history,
      portfolio: history.map((h, i) => ({ t: h.t, price: idx[i] })),
      value: history.map((h) => ({ t: h.t, price: h.value })),
      benchmark: history.map((h, i) => ({ t: h.t, price: benchIdx[i] })),
      risk: riskMetrics(idx, { bench: benchIdx }),
      benchRisk: riskMetrics(benchIdx),
      drawdown: drawdown(idx).series.map((d, i) => ({ t: history[i].t, price: d * 100 })),
    };
  }, [full, rangeKey]);
}
