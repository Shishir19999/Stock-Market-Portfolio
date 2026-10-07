import { Link } from 'react-router-dom';
import { useAuth, useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, PageHeader } from '../components/ui.jsx';
import { Reveal, Parallax } from '../components/Reveal.jsx';
import DonutChart from '../components/DonutChart.jsx';
import { allocation } from '../lib/finance.js';
import { downloadCsv, toCsv } from '../lib/csv.js';
import { money, number, dateTime, tone } from '../lib/format.js';

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
  const { portfolio, bySymbol, transactions, watchlist, alerts } = useData();
  const { positions, totals } = portfolio;
  const slices = allocation(positions, { cash: totals.cash });
  const sorted = [...positions].sort((a, b) => b.value - a.value);
  const movers = watchlist.map((w) => bySymbol[w.symbol]).filter(Boolean).sort((a, b) => Math.abs(b.growth) - Math.abs(a.growth)).slice(0, 5);

  const exportHoldings = () =>
    downloadCsv(
      'holdings.csv',
      toCsv(sorted, [
        { label: 'Symbol', value: (p) => p.symbol },
        { label: 'Company', value: (p) => bySymbol[p.symbol]?.company },
        { label: 'Shares', value: (p) => p.shares },
        { label: 'Avg cost', value: (p) => p.avgCost.toFixed(2) },
        { label: 'Price', value: (p) => p.price.toFixed(2) },
        { label: 'Value', value: (p) => p.value.toFixed(2) },
        { label: 'P&L', value: (p) => p.pl.toFixed(2) },
        { label: 'P&L %', value: (p) => p.plPct.toFixed(2) },
      ]),
    );

  return (
    <>
      <div className="dash-hero">
        <Parallax speed={0.12} className="blob blob-a"><span /></Parallax>
        <Parallax speed={0.06} className="blob blob-b"><span /></Parallax>
      <PageHeader title="Dashboard" subtitle={`Welcome back${user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Here is how your portfolio is doing.`}>
        <Link to="/stocks" className="btn btn-primary">Browse market</Link>
        <button type="button" className="btn" onClick={exportHoldings} disabled={!sorted.length}>Export CSV</button>
      </PageHeader>
      </div>

      <div className="grid kpis">
        <Kpi label="Total value" value={money(totals.total)}>
          <span className="muted small">Cash {money(totals.cash)} · Invested {money(totals.invested)}</span>
        </Kpi>
        <Kpi label="Unrealized P&L" value={<span className={tone(totals.unrealized)}>{money(totals.unrealized)}</span>} delay={60}>
          <Change value={totals.unrealizedPct} />
        </Kpi>
        <Kpi label="Today (session)" value={<span className={tone(totals.dayPl)}>{money(totals.dayPl)}</span>} delay={120}>
          <Change value={totals.dayPlPct} />
        </Kpi>
        <Kpi label="Realized P&L" value={<span className={tone(totals.realized)}>{money(totals.realized)}</span>} delay={180}>
          <span className="muted small">From closed sales</span>
        </Kpi>
      </div>

      <div className="grid two">
        <Reveal as="section" className="card" aria-labelledby="alloc-h">
          <h2 id="alloc-h">Allocation</h2>
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
            <EmptyState title="Your watchlist is empty" action={<Link to="/stocks" className="btn">Find stocks to watch</Link>}>
              Add stocks from the market to follow their price here.
            </EmptyState>
          ) : (
            <ul className="plain-list">
              {movers.map((s) => (
                <li key={s.symbol} className="row between">
                  <Link to={`/stocks/${s.symbol}`}><strong>{s.symbol}</strong> <span className="muted">{s.company}</span></Link>
                  <span className="right">{money(s.price)} <Change value={s.growth} /></span>
                </li>
              ))}
            </ul>
          )}
          {alerts.length > 0 && <p className="muted small">{alerts.filter((a) => !a.triggeredAt).length} active price alert(s).</p>}
        </Reveal>
      </div>

      <section className="card" aria-labelledby="hold-h">
        <h2 id="hold-h">Holdings</h2>
        {sorted.length === 0 ? (
          <EmptyState title="No holdings yet">Your positions will show up here after your first buy.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Current holdings with profit and loss</caption>
              <thead>
                <tr>
                  <th scope="col">Stock</th>
                  <th scope="col" className="num">Shares</th>
                  <th scope="col" className="num hide-sm">Avg cost</th>
                  <th scope="col" className="num">Price</th>
                  <th scope="col" className="num">Value</th>
                  <th scope="col" className="num">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.symbol}>
                    <th scope="row">
                      <Link to={`/stocks/${p.symbol}`}>{p.symbol}</Link>
                      <div className="muted small hide-sm">{bySymbol[p.symbol]?.company}</div>
                    </th>
                    <td className="num">{number(p.shares)}</td>
                    <td className="num hide-sm">{money(p.avgCost)}</td>
                    <td className="num">{money(p.price)}</td>
                    <td className="num">{money(p.value)}</td>
                    <td className="num"><span className={tone(p.pl)}>{money(p.pl)}</span><br /><Change value={p.plPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="rec-h">
        <div className="row between">
          <h2 id="rec-h">Recent transactions</h2>
          <Link to="/transactions">View all</Link>
        </div>
        {transactions.length === 0 ? (
          <EmptyState title="No transactions yet">Orders you place are recorded here.</EmptyState>
        ) : (
          <ul className="plain-list">
            {transactions.slice(0, 5).map((t) => (
              <li key={t.id} className="row between">
                <span><span className={`badge ${t.side === 'buy' ? 'badge-gain' : 'badge-loss'}`}>{t.side.toUpperCase()}</span> {number(t.shares)} {t.symbol} at {money(t.price)}</span>
                <span className="muted small">{dateTime(t.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
