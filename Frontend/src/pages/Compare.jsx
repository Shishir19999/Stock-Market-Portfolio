import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, PageHeader } from '../components/ui.jsx';
import LineChart from '../components/LineChart.jsx';
import { generateHistory, rebase } from '../lib/history.js';
import { money, pct } from '../lib/format.js';

export default function Compare() {
  useTitle('Compare');
  const { stocks, bySymbol } = useData();
  const [params, setParams] = useSearchParams();
  const a = bySymbol[(params.get('a') || '').toUpperCase()];
  const b = bySymbol[(params.get('b') || '').toUpperCase()];

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const series = useMemo(
    () =>
      [a, b].filter(Boolean).map((s, i) => ({
        name: s.symbol,
        color: i === 0 ? 'var(--c1)' : 'var(--c2)',
        points: rebase(generateHistory(s)),
      })),
    [a?.symbol, b?.symbol], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const rows = [
    ['Company', (s) => s.company],
    ['Sector', (s) => s.sector],
    ['Price in 2002', (s) => money(s.price_2002)],
    ['Price in 2007', (s) => money(s.price_2007)],
    ['Current price', (s) => money(s.price)],
    ['2002 to 2007', (s) => <Change value={((s.price_2007 - s.price_2002) / s.price_2002) * 100} />],
    ['Since 2007', (s) => <Change value={s.growth} />],
    ['Since 2002', (s) => <Change value={s.growthSince2002} />],
  ];

  const picker = (id, label, value, other) => (
    <div className="field grow">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value?.symbol || ''} onChange={(e) => set(id === 'cmp-a' ? 'a' : 'b', e.target.value)}>
        <option value="">Choose a stock…</option>
        {stocks.filter((s) => s.symbol !== other?.symbol).map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} - {s.company}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <PageHeader title="Compare" subtitle="Both prices are rebased to 100 at January 2002 so growth is comparable." />
      <div className="card filters">
        {picker('cmp-a', 'First stock', a, b)}
        {picker('cmp-b', 'Second stock', b, a)}
      </div>
      {!a || !b ? (
        <div className="card"><EmptyState icon="⇄" title="Pick two stocks to compare">Choose a first and second stock above to see their growth side by side.</EmptyState></div>
      ) : (
        <>
          <section className="card" aria-labelledby="cmp-h">
            <h2 id="cmp-h">Growth since 2002 (rebased to 100)</h2>
            <div className="chart-legend">
              {series.map((s) => <span key={s.name}><span className="swatch" style={{ background: s.color }} /> {s.name}</span>)}
            </div>
            <LineChart label={`Growth comparison of ${a.symbol} and ${b.symbol}`} series={series} valueFormat={(v) => v.toFixed(0)} />
          </section>
          <section className="card flush">
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Side-by-side comparison</caption>
                <thead>
                  <tr><th scope="col">Measure</th><th scope="col">{a.symbol}</th><th scope="col">{b.symbol}</th></tr>
                </thead>
                <tbody>
                  {rows.map(([label, fn]) => (
                    <tr key={label}><th scope="row">{label}</th><td>{fn(a)}</td><td>{fn(b)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small pad">
              Winner since 2002: <strong>{a.growthSince2002 >= b.growthSince2002 ? a.symbol : b.symbol}</strong> ({pct(Math.max(a.growthSince2002, b.growthSince2002))}).
            </p>
          </section>
        </>
      )}
    </>
  );
}
