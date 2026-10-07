import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, useTitle } from '../context/hooks.js';
import { EmptyState, PageHeader } from '../components/ui.jsx';
import { downloadCsv, toCsv } from '../lib/csv.js';
import { dateTime, money, number, tone } from '../lib/format.js';

export default function Transactions() {
  useTitle('Transactions');
  const { transactions } = useData();
  const [side, setSide] = useState('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return transactions.filter((t) => (side === 'all' || t.side === side) && (!term || t.symbol.toLowerCase().includes(term)));
  }, [transactions, side, q]);

  const exportCsv = () =>
    downloadCsv(
      'transactions.csv',
      toCsv(rows, [
        { label: 'Date', value: (t) => t.date },
        { label: 'Side', value: (t) => t.side },
        { label: 'Symbol', value: (t) => t.symbol },
        { label: 'Shares', value: (t) => t.shares },
        { label: 'Price', value: (t) => t.price.toFixed(2) },
        { label: 'Amount', value: (t) => t.amount.toFixed(2) },
        { label: 'Realized P&L', value: (t) => (t.realized === null ? '' : t.realized.toFixed(2)) },
      ]),
    );

  return (
    <>
      <PageHeader title="Transactions" subtitle={`${rows.length} of ${transactions.length} orders`}>
        <button type="button" className="btn" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
      </PageHeader>
      <form className="card filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="field grow">
          <label htmlFor="tq">Symbol</label>
          <input id="tq" type="search" placeholder="e.g. MSFT" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ts">Type</label>
          <select id="ts" value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="all">Buys and sells</option>
            <option value="buy">Buys</option>
            <option value="sell">Sells</option>
          </select>
        </div>
      </form>
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title={transactions.length ? 'No orders match your filters' : 'No transactions yet'} action={<Link to="/stocks" className="btn btn-primary">Browse the market</Link>}>
            {transactions.length ? 'Clear the filters to see everything.' : 'Place a buy or sell order and it will be listed here.'}
          </EmptyState>
        </div>
      ) : (
        <div className="card flush">
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Transaction history</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Order</th>
                  <th scope="col" className="num hide-sm">Price</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col" className="num hide-sm">Realized P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>{dateTime(t.date)}</td>
                    <td>
                      <span className={`badge ${t.side === 'buy' ? 'badge-gain' : 'badge-loss'}`}>{t.side.toUpperCase()}</span>{' '}
                      {number(t.shares)} <Link to={`/stocks/${t.symbol}`}>{t.symbol}</Link>
                    </td>
                    <td className="num hide-sm">{money(t.price)}</td>
                    <td className="num">{money(t.amount)}</td>
                    <td className="num hide-sm">{t.realized === null ? '—' : <span className={tone(t.realized)}>{money(t.realized)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
