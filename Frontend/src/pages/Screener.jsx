import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { stockMetrics } from '@shared/analytics.js';
import { SECTORS } from '@shared/sectors.js';
import { useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, Field, PageHeader, SortTh } from '../components/ui.jsx';
import { screen } from '../lib/stocks.js';
import { useSort } from '../lib/useSort.js';
import { downloadCsv, toCsv } from '../lib/download.js';
import { money, plainPct } from '../lib/format.js';

const BLANK = { sector: 'all', minPrice: '', maxPrice: '', minRet1Y: '', maxRet1Y: '', maxVol: '', minRsi: '', maxRsi: '', trend: 'any' };
const PRESETS = [
  ['Momentum', { ...BLANK, minRet1Y: '20', trend: 'above50' }],
  ['Oversold (RSI under 35)', { ...BLANK, maxRsi: '35' }],
  ['Low volatility', { ...BLANK, maxVol: '25' }],
  ['Below 50-day average', { ...BLANK, trend: 'below50' }],
];

export default function Screener() {
  useTitle('Screener');
  const { stocks, seriesFor } = useData();
  const [c, setC] = useState(BLANK);
  const metrics = useMemo(() => stocks.map((s) => ({ stock: s, m: stockMetrics(seriesFor(s.symbol)) })), [stocks, seriesFor]);
  const matches = useMemo(() => screen(metrics, c).map(({ stock, m }) => ({ ...stock, ...m })), [metrics, c]);
  const cols = useMemo(() => ({ symbol: (r) => r.symbol, price: (r) => r.price, day: (r) => r.changePct, ret1M: (r) => r.ret1M, ret1Y: (r) => r.ret1Y, vol: (r) => r.volatility, rsi: (r) => r.rsi ?? 0, high: (r) => r.fromHigh }), []);
  const s = useSort(matches, cols, { key: 'ret1Y', dir: 'desc' });
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }));

  const exportCsv = () => downloadCsv('screener.csv', toCsv(matches, [
    { label: 'Symbol', value: (r) => r.symbol }, { label: 'Company', value: (r) => r.company }, { label: 'Sector', value: (r) => r.sector },
    { label: 'Price', value: (r) => r.price.toFixed(2) }, { label: 'Today %', value: (r) => r.changePct.toFixed(2) }, { label: '1M %', value: (r) => (r.ret1M * 100).toFixed(1) },
    { label: '1Y %', value: (r) => (r.ret1Y * 100).toFixed(1) }, { label: 'Volatility %', value: (r) => (r.volatility * 100).toFixed(1) }, { label: 'RSI', value: (r) => r.rsi?.toFixed(1) },
  ]));

  return (
    <>
      <PageHeader title="Stock screener" subtitle="Filter the market by price, momentum, volatility and technical signals. Every filter is optional.">
        <button type="button" className="btn" onClick={exportCsv} disabled={!matches.length}>Export CSV</button>
      </PageHeader>
      <section className="card" aria-labelledby="crit-h">
        <h2 id="crit-h">Criteria</h2>
        <div className="row wrap preset-row" role="group" aria-label="Presets">
          {PRESETS.map(([name, p]) => <button key={name} type="button" className="btn btn-sm" onClick={() => setC(p)}>{name}</button>)}
          <button type="button" className="btn btn-sm" onClick={() => setC(BLANK)}>Clear all</button>
        </div>
        <form className="screen-grid" onSubmit={(e) => e.preventDefault()}>
          <Field id="sc-sector" label="Sector">
            <select id="sc-sector" value={c.sector} onChange={set('sector')}><option value="all">All sectors</option>{SECTORS.map((x) => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field id="sc-minp" label="Min price"><input id="sc-minp" type="number" min="0" step="any" value={c.minPrice} onChange={set('minPrice')} /></Field>
          <Field id="sc-maxp" label="Max price"><input id="sc-maxp" type="number" min="0" step="any" value={c.maxPrice} onChange={set('maxPrice')} /></Field>
          <Field id="sc-minr" label="Min 1-year return %"><input id="sc-minr" type="number" step="any" value={c.minRet1Y} onChange={set('minRet1Y')} /></Field>
          <Field id="sc-maxr" label="Max 1-year return %"><input id="sc-maxr" type="number" step="any" value={c.maxRet1Y} onChange={set('maxRet1Y')} /></Field>
          <Field id="sc-vol" label="Max volatility %"><input id="sc-vol" type="number" min="0" step="any" value={c.maxVol} onChange={set('maxVol')} /></Field>
          <Field id="sc-minrsi" label="Min RSI"><input id="sc-minrsi" type="number" min="0" max="100" step="any" value={c.minRsi} onChange={set('minRsi')} /></Field>
          <Field id="sc-maxrsi" label="Max RSI"><input id="sc-maxrsi" type="number" min="0" max="100" step="any" value={c.maxRsi} onChange={set('maxRsi')} /></Field>
          <Field id="sc-trend" label="Trend">
            <select id="sc-trend" value={c.trend} onChange={set('trend')}>
              <option value="any">Any</option><option value="above50">Above 50-day average</option><option value="below50">Below 50-day average</option><option value="above200">Above 200-day average</option>
            </select>
          </Field>
        </form>
      </section>

      <section className="card flush" aria-labelledby="res-h">
        <h2 id="res-h" className="pad">Results <span className="muted small" aria-live="polite">({matches.length} of {stocks.length})</span></h2>
        {matches.length === 0 ? (
          <EmptyState title="No stocks match these criteria" action={<button type="button" className="btn" onClick={() => setC(BLANK)}>Clear filters</button>}>Loosen a filter to see more results.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Screener results</caption>
              <thead>
                <tr>
                  <SortTh sortKey="symbol" s={s}>Stock</SortTh>
                  <SortTh sortKey="price" s={s} className="num">Price</SortTh>
                  <SortTh sortKey="day" s={s} className="num">Today</SortTh>
                  <SortTh sortKey="ret1M" s={s} className="num hide-sm">1M</SortTh>
                  <SortTh sortKey="ret1Y" s={s} className="num">1Y</SortTh>
                  <SortTh sortKey="vol" s={s} className="num hide-sm">Volatility</SortTh>
                  <SortTh sortKey="rsi" s={s} className="num hide-sm">RSI</SortTh>
                  <SortTh sortKey="high" s={s} className="num hide-sm">From 52w high</SortTh>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.symbol}>
                    <th scope="row"><Link to={`/stocks/${r.symbol}`}><strong>{r.symbol}</strong></Link> <span className="muted small hide-sm">{r.company}</span></th>
                    <td className="num">{money(r.price)}</td>
                    <td className="num"><Change value={r.changePct} /></td>
                    <td className="num hide-sm"><Change value={r.ret1M * 100} /></td>
                    <td className="num"><Change value={r.ret1Y * 100} /></td>
                    <td className="num hide-sm">{plainPct(r.volatility * 100)}</td>
                    <td className="num hide-sm">{r.rsi?.toFixed(0)}</td>
                    <td className="num hide-sm">{plainPct(r.fromHigh * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
