import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { lotReport } from '@shared/finance.js';
import { COST_METHODS } from '@shared/finance.js';
import { useAuth, useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, PageHeader } from '../components/ui.jsx';
import { downloadCsv, toCsv } from '../lib/download.js';
import { dateOnly, money, number, tone } from '../lib/format.js';

const Term = ({ term }) => <span className={`badge ${term === 'long' ? 'badge-gain' : ''}`}>{term === 'long' ? 'Long-term' : 'Short-term'}</span>;

export default function Reports() {
  useTitle('Reports');
  const { user } = useAuth();
  const { portfolio, result, scope, portfolios, prices, bySymbol } = useData();
  const { totals, positions } = portfolio;
  const scopeName = scope === 'all' ? 'All portfolios' : portfolios.find((p) => p.id === scope)?.name;
  const lots = useMemo(() => lotReport(result.lots, prices), [result.lots, prices]);
  const method = scope === 'all' ? 'per portfolio' : COST_METHODS[result.method] || result.method;

  const bySym = useMemo(() => {
    const m = new Map();
    const row = (symbol) => {
      if (!m.has(symbol)) m.set(symbol, { symbol, realized: 0, unrealized: 0, dividends: 0 });
      return m.get(symbol);
    };
    result.realized.forEach((r) => { row(r.symbol).realized += r.pl; });
    positions.forEach((p) => { row(p.symbol).unrealized += p.pl; });
    result.dividends.forEach((d) => { row(d.symbol).dividends += d.amount; });
    return [...m.values()].map((r) => ({ ...r, total: r.realized + r.unrealized + r.dividends })).sort((a, b) => b.total - a.total);
  }, [result.realized, result.dividends, positions]);

  const empty = !bySym.length && !lots.length;
  const exportLots = () => downloadCsv('tax-lots.csv', toCsv(lots, [
    { label: 'Symbol', value: (l) => l.symbol }, { label: 'Acquired', value: (l) => l.acquired.slice(0, 10) }, { label: 'Shares', value: (l) => l.shares },
    { label: 'Cost per share', value: (l) => l.unitCost.toFixed(4) }, { label: 'Cost basis', value: (l) => l.cost.toFixed(2) }, { label: 'Price', value: (l) => l.price.toFixed(2) },
    { label: 'Value', value: (l) => l.value.toFixed(2) }, { label: 'Gain', value: (l) => l.gain.toFixed(2) }, { label: 'Days held', value: (l) => l.days }, { label: 'Term', value: (l) => l.term },
  ]));
  const exportRealized = () => downloadCsv('realized-gains.csv', toCsv(result.realized, [
    { label: 'Sold', value: (r) => r.date.slice(0, 10) }, { label: 'Symbol', value: (r) => r.symbol }, { label: 'Shares', value: (r) => r.shares },
    { label: 'Proceeds', value: (r) => r.proceeds.toFixed(2) }, { label: 'Cost basis', value: (r) => r.cost.toFixed(2) }, { label: 'Gain', value: (r) => r.pl.toFixed(2) }, { label: 'Term', value: (r) => r.term },
  ]));
  const exportSummary = () => downloadCsv('pnl-by-stock.csv', toCsv(bySym, [
    { label: 'Symbol', value: (r) => r.symbol }, { label: 'Realized', value: (r) => r.realized.toFixed(2) }, { label: 'Unrealized', value: (r) => r.unrealized.toFixed(2) },
    { label: 'Dividends', value: (r) => r.dividends.toFixed(2) }, { label: 'Total', value: (r) => r.total.toFixed(2) },
  ]));
  const exportDiv = () => downloadCsv('dividends.csv', toCsv(result.dividends, [
    { label: 'Date', value: (d) => d.date.slice(0, 10) }, { label: 'Symbol', value: (d) => d.symbol }, { label: 'Amount', value: (d) => d.amount.toFixed(2) },
  ]));

  return (
    <div className="report">
      <PageHeader title="Reports" subtitle={`${scopeName} · cost basis ${method}`}>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
      </PageHeader>
      <p className="print-only small">Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} for {user?.name}. Sample prices; paper trading only.</p>

      {empty ? (
        <div className="card"><EmptyState title="Nothing to report yet" action={<Link to="/transactions" className="btn btn-primary">Add transactions</Link>}>Reports are built from your transactions.</EmptyState></div>
      ) : (
        <>
          <section className="card" aria-labelledby="sum-h">
            <div className="row between wrap"><h2 id="sum-h">Realized vs unrealized</h2><button type="button" className="btn btn-sm no-print" onClick={exportSummary}>Export CSV</button></div>
            <dl className="kv grid-kv">
              <div><dt>Realized gains</dt><dd className={tone(totals.realized)}>{money(totals.realized)}</dd></div>
              <div><dt>Unrealized gains</dt><dd className={tone(totals.unrealized)}>{money(totals.unrealized)}</dd></div>
              <div><dt>Dividends</dt><dd>{money(totals.dividends)}</dd></div>
              <div><dt>Fees paid</dt><dd>{money(totals.fees)}</dd></div>
              <div><dt>Total return</dt><dd className={tone(totals.gain)}>{money(totals.gain)}</dd></div>
              <div><dt>Net deposits</dt><dd>{money(totals.netDeposits)}</dd></div>
            </dl>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Profit and loss by stock</caption>
                <thead><tr><th scope="col">Stock</th><th scope="col" className="num">Realized</th><th scope="col" className="num">Unrealized</th><th scope="col" className="num">Dividends</th><th scope="col" className="num">Total</th></tr></thead>
                <tbody>
                  {bySym.map((r) => (
                    <tr key={r.symbol}>
                      <th scope="row"><Link to={`/stocks/${r.symbol}`}>{r.symbol}</Link> <span className="muted small hide-sm">{bySymbol[r.symbol]?.company}</span></th>
                      <td className="num"><span className={tone(r.realized)}>{money(r.realized)}</span></td>
                      <td className="num"><span className={tone(r.unrealized)}>{money(r.unrealized)}</span></td>
                      <td className="num">{money(r.dividends)}</td>
                      <td className="num"><strong className={tone(r.total)}>{money(r.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" aria-labelledby="lot-h">
            <div className="row between wrap"><h2 id="lot-h">Tax lots</h2><button type="button" className="btn btn-sm no-print" onClick={exportLots} disabled={!lots.length}>Export CSV</button></div>
            <p className="muted small">Open purchase lots in FIFO order with holding period. Long-term means held more than one year. Illustrative only, not tax advice.</p>
            {lots.length === 0 ? <p className="muted">No open lots.</p> : (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Open tax lots</caption>
                  <thead><tr><th scope="col">Stock</th><th scope="col">Acquired</th><th scope="col" className="num">Shares</th><th scope="col" className="num hide-sm">Cost / share</th><th scope="col" className="num">Cost basis</th><th scope="col" className="num">Value</th><th scope="col" className="num">Gain</th><th scope="col">Term</th></tr></thead>
                  <tbody>
                    {lots.map((l) => (
                      <tr key={l.id + l.symbol}>
                        <th scope="row">{l.symbol}</th>
                        <td>{dateOnly(l.acquired)}<div className="muted small">{l.days} days</div></td>
                        <td className="num">{number(l.shares)}</td>
                        <td className="num hide-sm">{money(l.unitCost)}</td>
                        <td className="num">{money(l.cost)}</td>
                        <td className="num">{money(l.value)}</td>
                        <td className="num"><span className={tone(l.gain)}>{money(l.gain)}</span><br /><Change value={l.gainPct} /></td>
                        <td><Term term={l.term} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="real-h">
            <div className="row between wrap"><h2 id="real-h">Realized gains</h2><button type="button" className="btn btn-sm no-print" onClick={exportRealized} disabled={!result.realized.length}>Export CSV</button></div>
            {result.realized.length === 0 ? <p className="muted">No sales yet.</p> : (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Closed sales</caption>
                  <thead><tr><th scope="col">Sold</th><th scope="col">Stock</th><th scope="col" className="num">Shares</th><th scope="col" className="num">Proceeds</th><th scope="col" className="num">Cost basis</th><th scope="col" className="num">Gain</th><th scope="col">Term</th></tr></thead>
                  <tbody>
                    {result.realized.map((r) => (
                      <tr key={r.txId}>
                        <td>{dateOnly(r.date)}</td><th scope="row">{r.symbol}</th>
                        <td className="num">{number(r.shares)}</td><td className="num">{money(r.proceeds)}</td><td className="num">{money(r.cost)}</td>
                        <td className="num"><span className={tone(r.pl)}>{money(r.pl)}</span></td><td><Term term={r.term} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="dv-h">
            <div className="row between wrap"><h2 id="dv-h">Dividends</h2><button type="button" className="btn btn-sm no-print" onClick={exportDiv} disabled={!result.dividends.length}>Export CSV</button></div>
            {result.dividends.length === 0 ? <p className="muted">No dividends recorded.</p> : (
              <ul className="plain-list">
                {result.dividends.map((d) => (
                  <li key={d.txId}><span><strong>{d.symbol}</strong> <span className="muted small">{dateOnly(d.date)}</span></span><strong>{money(d.amount)}</strong></li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
