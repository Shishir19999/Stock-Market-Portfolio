import { Link } from 'react-router-dom';
import { useConfirm, useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, PageHeader } from '../components/ui.jsx';
import AlertPanel from '../components/AlertPanel.jsx';
import { downloadCsv, toCsv } from '../lib/csv.js';
import { money } from '../lib/format.js';

export default function Watchlist() {
  useTitle('Watchlist');
  const { watchlist, bySymbol, removeFromWatchlist, alerts } = useData();
  const { confirm } = useConfirm();
  const rows = watchlist.map((w) => bySymbol[w.symbol] || { ...w, price: w.initial_price, growth: 0, sector: '' });

  const onRemove = async (s) => {
    const ok = await confirm({
      title: `Remove ${s.symbol}?`,
      message: `${s.company} will be removed from your watchlist. Alerts you set for it stay in place.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) removeFromWatchlist(s.symbol);
  };

  const exportCsv = () =>
    downloadCsv(
      'watchlist.csv',
      toCsv(rows, [
        { label: 'Symbol', value: (s) => s.symbol },
        { label: 'Company', value: (s) => s.company },
        { label: 'Price', value: (s) => Number(s.price).toFixed(2) },
        { label: 'Change since 2007 %', value: (s) => Number(s.growth).toFixed(2) },
      ]),
    );

  return (
    <>
      <PageHeader title="Watchlist" subtitle={`${rows.length} stock${rows.length === 1 ? '' : 's'} followed`}>
        <button type="button" className="btn" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
      </PageHeader>
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="Your watchlist is empty" action={<Link to="/stocks" className="btn btn-primary">Browse the market</Link>}>
            Tap the Watch button on any stock to follow it here.
          </EmptyState>
        </div>
      ) : (
        <div className="card flush">
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Watched stocks</caption>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col" className="num">Price</th>
                  <th scope="col" className="num">Since 2007</th>
                  <th scope="col" className="num hide-sm">Alerts</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.symbol}>
                    <th scope="row">
                      <Link to={`/stocks/${s.symbol}`}><strong>{s.symbol}</strong></Link>
                      <div className="muted small">{s.company}</div>
                    </th>
                    <td className="num">{money(s.price)}</td>
                    <td className="num"><Change value={s.growth} /></td>
                    <td className="num hide-sm">{alerts.filter((a) => a.symbol === s.symbol && !a.triggeredAt).length}</td>
                    <td className="num">
                      <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => onRemove(s)} aria-label={`Remove ${s.symbol} from watchlist`}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <AlertPanel />
    </>
  );
}
