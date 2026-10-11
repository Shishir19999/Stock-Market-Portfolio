import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allocate, goalProgress } from '@shared/finance.js';
import { sectorOf } from '@shared/sectors.js';
import { BENCHMARK_NAME } from '@shared/market.js';
import { useAuth, useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, PageHeader, Progress, Segmented, SortTh } from '../components/ui.jsx';
import { Reveal, Parallax } from '../components/Reveal.jsx';
import DonutChart from '../components/DonutChart.jsx';
import LineChart from '../components/LineChart.jsx';
import { usePerformance, PERF_RANGES } from '../lib/usePerformance.js';
import { useSort } from '../lib/useSort.js';
import { downloadCsv, toCsv } from '../lib/download.js';
import { money, number, dateTime, tone, plainPct } from '../lib/format.js';

function Kpi({ label, value, children, delay }) {
  return (
    <Reveal className="card kpi" delay={delay}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {children}
    </Reveal>
  );
}

export default function Dashboard() {
  useTitle('Dashboard');
  const { user } = useAuth();
  const { portfolio, bySymbol, scopedTx, watchlists, orders, goals, scope, portfolios } = useData();
  const [alloc, setAlloc] = useState('holding');
  const [range, setRange] = useState('3M');
  const perf = usePerformance(range);
  const { positions, totals } = portfolio;
  const scopeName = scope === 'all' ? 'All portfolios' : portfolios.find((p) => p.id === scope)?.name;
  const rows = useMemo(() => positions.map((p) => ({ ...p, weight: totals.total > 0 ? (p.value / totals.total) * 100 : 0 })), [positions, totals.total]);
  const cols = useMemo(() => ({ symbol: (r) => r.symbol, shares: (r) => r.shares, avgCost: (r) => r.avgCost, price: (r) => r.price, value: (r) => r.value, pl: (r) => r.pl, weight: (r) => r.weight, day: (r) => r.dayPl }), []);
  const s = useSort(rows, cols, { key: 'value', dir: 'desc' });
  const slices = allocate(positions, totals.cash, alloc, { sectorOf });
  const watchSymbols = [...new Set(watchlists.flatMap((w) => w.symbols))];
  const movers = watchSymbols.map((x) => bySymbol[x]).filter(Boolean).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 5);
  const openOrders = orders.filter((o) => o.status === 'open');
  const scopeTx = scopedTx;
  const recent = [...scopeTx].slice(0, 5);
  const topGoals = goals.filter((g) => g.portfolioId === 'all' || scope === 'all' || g.portfolioId === scope).slice(0, 2);
  const retPort = perf ? perf.risk.totalReturn : 0;
  const retBench = perf ? perf.benchRisk.totalReturn : 0;

  const exportHoldings = () =>
    downloadCsv('holdings.csv', toCsv(rows, [
      { label: 'Symbol', value: (p) => p.symbol }, { label: 'Company', value: (p) => bySymbol[p.symbol]?.company },
      { label: 'Shares', value: (p) => p.shares }, { label: 'Avg cost', value: (p) => p.avgCost.toFixed(2) }, { label: 'Price', value: (p) => p.price.toFixed(2) },
      { label: 'Value', value: (p) => p.value.toFixed(2) }, { label: 'Weight %', value: (p) => p.weight.toFixed(2) },
      { label: 'Unrealized P&L', value: (p) => p.pl.toFixed(2) }, { label: 'P&L %', value: (p) => p.plPct.toFixed(2) },
    ]));

  return (
    <>
      <div className="dash-hero">
        <Parallax speed={0.12} className="blob blob-a"><span /></Parallax>
        <Parallax speed={0.06} className="blob blob-b"><span /></Parallax>
        <PageHeader title="Dashboard" subtitle={`Welcome back${user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Showing ${scopeName}.`}>
          <Link to="/stocks" className="btn btn-primary">Browse market</Link>
          <button type="button" className="btn" onClick={exportHoldings} disabled={!rows.length}>Export holdings CSV</button>
          <Link to="/reports" className="btn">Reports</Link>
        </PageHeader>
      </div>

      <div className="grid kpis kpis-6">
        <Kpi label="Total value" value={money(totals.total)}>
          <span className="muted small">Cash {money(totals.cash)} · Invested {money(totals.invested)}</span>
        </Kpi>
        <Kpi label="Total gain" value={<span className={tone(totals.gain)}>{money(totals.gain)}</span>} delay={40}>
          <Change value={totals.gainPct} /><span className="muted small">vs deposits {money(totals.netDeposits)}</span>
        </Kpi>
        <Kpi label="Today" value={<span className={tone(totals.dayPl)}>{money(totals.dayPl)}</span>} delay={80}>
          <Change value={totals.dayPlPct} />
        </Kpi>
        <Kpi label="Unrealized P&L" value={<span className={tone(totals.unrealized)}>{money(totals.unrealized)}</span>} delay={120}>
          <Change value={totals.unrealizedPct} />
        </Kpi>
        <Kpi label="Realized P&L" value={<span className={tone(totals.realized)}>{money(totals.realized)}</span>} delay={160}>
          <span className="muted small">From closed sales</span>
        </Kpi>
        <Kpi label="Dividends" value={money(totals.dividends)} delay={200}>
          <span className="muted small">Fees paid {money(totals.fees)}</span>
        </Kpi>
      </div>

      <Reveal as="section" className="card" aria-labelledby="perf-h">
        <div className="row between wrap">
          <div>
            <h2 id="perf-h">Performance vs benchmark</h2>
            {perf && (
              <p className="small">
                Portfolio <Change value={retPort * 100} /> · {BENCHMARK_NAME} <Change value={retBench * 100} /> · <span className="muted">time-weighted, deposits excluded</span>
              </p>
            )}
          </div>
          <Segmented label="Performance range" value={range} onChange={setRange} options={Object.keys(PERF_RANGES).map((k) => [k, k === 'ALL' ? 'All' : k])} />
        </div>
        {perf ? (
          <LineChart
            label={`Portfolio performance versus ${BENCHMARK_NAME}, indexed to 100`}
            series={[{ name: 'Portfolio', color: 'var(--c1)', points: perf.portfolio }, { name: BENCHMARK_NAME, color: 'var(--c2)', dash: '6 4', points: perf.benchmark }]}
            valueFormat={(v) => v.toFixed(1)}
            area={false}
            allowNegative
          />
        ) : (
          <EmptyState title="No history yet">Make a deposit and a trade to see performance against the benchmark.</EmptyState>
        )}
      </Reveal>

      <div className="grid two">
        <Reveal as="section" className="card" aria-labelledby="alloc-h">
          <div className="row between wrap">
            <h2 id="alloc-h">Allocation</h2>
            <Segmented label="Allocation view" value={alloc} onChange={setAlloc} options={[['holding', 'Holding'], ['sector', 'Sector'], ['asset', 'Asset']]} />
          </div>
          {slices.length === 0 ? (
            <EmptyState title="Nothing to allocate yet" action={<Link to="/stocks" className="btn btn-primary">Make your first trade</Link>}>
              Buy a stock and your allocation chart appears here.
            </EmptyState>
          ) : (
            <DonutChart slices={slices} centerLabel="Total" centerValue={money(totals.total)} />
          )}
        </Reveal>

        <Reveal as="section" className="card" aria-labelledby="mov-h" delay={80}>
          <h2 id="mov-h">Watchlist movers</h2>
          {movers.length === 0 ? (
            <EmptyState title="Your watchlists are empty" action={<Link to="/watchlists" className="btn">Manage watchlists</Link>}>
              Add stocks to a watchlist to follow their price here.
            </EmptyState>
          ) : (
            <ul className="plain-list">
              {movers.map((m) => (
                <li key={m.symbol} className="row between">
                  <Link to={`/stocks/${m.symbol}`}><strong>{m.symbol}</strong> <span className="muted">{m.company}</span></Link>
                  <span className="right">{money(m.price)} <Change value={m.changePct} /></span>
                </li>
              ))}
            </ul>
          )}
          {topGoals.length > 0 && (
            <div className="stack-sm goal-mini">
              <h3>Goals</h3>
              {topGoals.map((g) => {
                const gp = goalProgress(g, g.portfolioId === 'all' ? totals.total : portfolio.totals.total);
                return (
                  <div key={g.id}>
                    <div className="row between small"><span>{g.name}</span><span>{plainPct(gp.pct, 0)}</span></div>
                    <Progress value={gp.pct} label={`${g.name} progress`} />
                  </div>
                );
              })}
            </div>
          )}
        </Reveal>
      </div>

      <section className="card" aria-labelledby="hold-h">
        <h2 id="hold-h">Holdings</h2>
        {rows.length === 0 ? (
          <EmptyState title="No holdings yet">Your positions will show up here after your first buy.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Current holdings with profit and loss</caption>
              <thead>
                <tr>
                  <SortTh sortKey="symbol" s={s}>Stock</SortTh>
                  <SortTh sortKey="shares" s={s} className="num">Shares</SortTh>
                  <SortTh sortKey="avgCost" s={s} className="num hide-sm">Avg cost</SortTh>
                  <SortTh sortKey="price" s={s} className="num">Price</SortTh>
                  <SortTh sortKey="day" s={s} className="num hide-sm">Today</SortTh>
                  <SortTh sortKey="value" s={s} className="num">Value</SortTh>
                  <SortTh sortKey="weight" s={s} className="num hide-sm">Weight</SortTh>
                  <SortTh sortKey="pl" s={s} className="num">P&amp;L</SortTh>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((p) => (
                  <tr key={p.symbol}>
                    <th scope="row">
                      <Link to={`/stocks/${p.symbol}`}>{p.symbol}</Link>
                      <div className="muted small hide-sm">{bySymbol[p.symbol]?.company}</div>
                    </th>
                    <td className="num">{number(p.shares)}</td>
                    <td className="num hide-sm">{money(p.avgCost)}</td>
                    <td className="num">{money(p.price)}</td>
                    <td className="num hide-sm"><span className={tone(p.dayPl)}>{money(p.dayPl)}</span></td>
                    <td className="num">{money(p.value)}</td>
                    <td className="num hide-sm">{plainPct(p.weight)}</td>
                    <td className="num"><span className={tone(p.pl)}>{money(p.pl)}</span><br /><Change value={p.plPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid two">
        <section className="card" aria-labelledby="ord-h">
          <div className="row between"><h2 id="ord-h">Open orders</h2><Link to="/orders">All orders</Link></div>
          {openOrders.length === 0 ? (
            <EmptyState title="No open orders">Limit and stop orders waiting to fill show up here.</EmptyState>
          ) : (
            <ul className="plain-list">
              {openOrders.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <span><span className={`badge ${o.side === 'buy' ? 'badge-gain' : 'badge-loss'}`}>{o.side.toUpperCase()}</span> {number(o.shares)} {o.symbol} {o.type} {money(o.limitPrice ?? o.stopPrice ?? 0)}</span>
                  <span className="muted small">{bySymbol[o.symbol] ? `now ${money(bySymbol[o.symbol].price)}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card" aria-labelledby="rec-h">
          <div className="row between"><h2 id="rec-h">Recent transactions</h2><Link to="/transactions">View all</Link></div>
          {recent.length === 0 ? (
            <EmptyState title="No transactions yet">Orders and cash movements are recorded here.</EmptyState>
          ) : (
            <ul className="plain-list">
              {recent.map((t) => (
                <li key={t.id}>
                  <span>
                    <span className={`badge ${t.type === 'buy' ? 'badge-gain' : t.type === 'sell' ? 'badge-loss' : ''}`}>{t.type.toUpperCase()}</span>{' '}
                    {t.symbol ? `${t.shares ? `${number(t.shares)} ` : ''}${t.symbol}${t.price ? ` at ${money(t.price)}` : ''}` : money(t.amount)}
                  </span>
                  <span className="muted small">{dateTime(t.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
