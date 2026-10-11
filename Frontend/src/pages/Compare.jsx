import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { drawdown, riskMetrics, rsi, stockMetrics } from '@shared/analytics.js';
import { DAILY_RANGES, sliceDays } from '@shared/market.js';
import { useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, PageHeader, Segmented, StockSelect } from '../components/ui.jsx';
import LineChart from '../components/LineChart.jsx';
import { money, plainPct } from '../lib/format.js';

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
const DASHES = [undefined, '6 4', '2 3', '10 3 2 3'];
const MAX = 4;

export default function Compare() {
  useTitle('Compare stocks');
  const { stocks, bySymbol, seriesFor } = useData();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState('1Y');
  const [pick, setPick] = useState('');
  const fromUrl = (params.get('s') || [params.get('a'), params.get('b')].filter(Boolean).join(',')).split(',').map((x) => x.trim().toUpperCase()).filter((x) => bySymbol[x]);
  const symbols = [...new Set(fromUrl)].slice(0, MAX);
  const setSymbols = (list) => setParams(list.length ? { s: list.join(',') } : {}, { replace: true });
  const options = stocks.filter((s) => !symbols.includes(s.symbol));
  const choice = pick && options.some((s) => s.symbol === pick) ? pick : options[0]?.symbol || '';

  const key = symbols.join(',');
  const rows = useMemo(() => key.split(',').filter(Boolean).map((sym, i) => {
    const full = seriesFor(sym);
    const win = sliceDays(full, range);
    const closes = win.map((c) => c.c);
    const base = closes[0] || 1;
    const m = stockMetrics(full);
    const risk = riskMetrics(closes);
    return {
      sym, color: COLORS[i], dash: DASHES[i], stock: bySymbol[sym], m, risk, dd: drawdown(closes).maxDrawdown,
      rsi: rsi(full.map((c) => c.c), 14).at(-1),
      points: win.map((c) => ({ t: c.t, price: (c.c / base) * 100 })),
    };
  }), [key, range, seriesFor, bySymbol]);

  return (
    <>
      <PageHeader title="Compare stocks" subtitle="Rebased to 100 at the start of the range so different prices are comparable. Add up to four." />
      <section className="card stack-sm" aria-labelledby="pick-h">
        <h2 id="pick-h">Choose stocks</h2>
        <div className="row wrap">
          {symbols.map((sym, i) => (
            <span className="chip" key={sym}>
              <span className="swatch" style={{ background: COLORS[i] }} aria-hidden="true" /> {sym}
              <button type="button" className="icon-btn chip-x" onClick={() => setSymbols(symbols.filter((x) => x !== sym))} aria-label={`Remove ${sym}`}>×</button>
            </span>
          ))}
        </div>
        {symbols.length < MAX && (
          <div className="row wrap pick-row">
            <StockSelect id="cmp-add" label="Add a stock" value={choice} onChange={setPick} stocks={options} />
            <button type="button" className="btn btn-primary" onClick={() => { setSymbols([...symbols, choice]); setPick(''); }} disabled={!choice}>Add to comparison</button>
          </div>
        )}
      </section>

      {symbols.length < 2 ? (
        <div className="card"><EmptyState title="Pick at least two stocks">Add stocks above to see them side by side, or open a stock and use Compare.</EmptyState></div>
      ) : (
        <>
          <section className="card" aria-labelledby="cmp-h">
            <div className="row between wrap">
              <h2 id="cmp-h">Relative performance</h2>
              <Segmented label="Range" value={range} onChange={setRange} options={Object.keys(DAILY_RANGES).map((k) => [k, k === 'ALL' ? 'All' : k])} />
            </div>
            <LineChart label={`Relative performance of ${symbols.join(', ')}, rebased to 100`} series={rows.map((r) => ({ name: r.sym, color: r.color, dash: r.dash, points: r.points }))} valueFormat={(v) => v.toFixed(1)} area={false} />
            <ul className="chart-legend" aria-label="Legend">{rows.map((r) => <li key={r.sym}><span className="swatch" style={{ background: r.color }} aria-hidden="true" /> {r.sym}</li>)}</ul>
          </section>
          <section className="card" aria-labelledby="tbl-h">
            <h2 id="tbl-h">Side by side</h2>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Metrics for the selected stocks</caption>
                <thead><tr><th scope="col">Metric</th>{rows.map((r) => <th scope="col" className="num" key={r.sym}><Link to={`/stocks/${r.sym}`}>{r.sym}</Link></th>)}</tr></thead>
                <tbody>
                  <tr><th scope="row">Company</th>{rows.map((r) => <td className="num" key={r.sym}>{r.stock.company}</td>)}</tr>
                  <tr><th scope="row">Price</th>{rows.map((r) => <td className="num" key={r.sym}>{money(r.stock.price)}</td>)}</tr>
                  <tr><th scope="row">Today</th>{rows.map((r) => <td className="num" key={r.sym}><Change value={r.stock.changePct} /></td>)}</tr>
                  <tr><th scope="row">Return ({range})</th>{rows.map((r) => <td className="num" key={r.sym}><Change value={r.risk.totalReturn * 100} /></td>)}</tr>
                  <tr><th scope="row">Volatility ({range})</th>{rows.map((r) => <td className="num" key={r.sym}>{plainPct(r.risk.volatility * 100)}</td>)}</tr>
                  <tr><th scope="row">Max drawdown ({range})</th>{rows.map((r) => <td className="num" key={r.sym}>{plainPct(r.dd * 100)}</td>)}</tr>
                  <tr><th scope="row">Sharpe ({range})</th>{rows.map((r) => <td className="num" key={r.sym}>{r.risk.sharpe.toFixed(2)}</td>)}</tr>
                  <tr><th scope="row">52-week range</th>{rows.map((r) => <td className="num" key={r.sym}>{money(r.m.lo52)} to {money(r.m.hi52)}</td>)}</tr>
                  <tr><th scope="row">RSI (14)</th>{rows.map((r) => <td className="num" key={r.sym}>{r.rsi?.toFixed(0)}</td>)}</tr>
                  <tr><th scope="row">Sector</th>{rows.map((r) => <td className="num" key={r.sym}>{r.stock.sector}</td>)}</tr>
                  <tr><th scope="row">Since 2007</th>{rows.map((r) => <td className="num" key={r.sym}><Change value={r.stock.growth} digits={0} /></td>)}</tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
