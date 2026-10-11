import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm, useData, useTitle, useToast } from '../context/hooks.js';
import { EmptyState, PageHeader, Segmented } from '../components/ui.jsx';
import { dateTime, money, number } from '../lib/format.js';

const STATUS = { open: 'Open', filled: 'Filled', cancelled: 'Cancelled', rejected: 'Rejected' };
const TONE = { open: '', filled: 'badge-gain', cancelled: '', rejected: 'badge-loss' };

export default function Orders() {
  useTitle('Orders');
  const { orders, scope, portfolios, bySymbol, cancelOrder } = useData();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const names = Object.fromEntries(portfolios.map((p) => [p.id, p.name]));
  const list = useMemo(
    () => orders.filter((o) => (scope === 'all' || o.portfolioId === scope) && (status === 'all' || o.status === status)),
    [orders, scope, status],
  );
  const counts = useMemo(() => Object.fromEntries(Object.keys(STATUS).map((k) => [k, orders.filter((o) => o.status === k).length])), [orders]);

  const cancel = async (o) => {
    const ok = await confirm({ title: 'Cancel this order?', message: `${o.type} ${o.side} ${o.shares} ${o.symbol} will not be filled.`, confirmLabel: 'Cancel order', danger: true });
    if (!ok) return;
    try {
      await cancelOrder(o.id);
      toast.success('Order cancelled.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader title="Orders" subtitle="Market orders fill instantly. Limit and stop orders wait until the simulated price allows, and are checked every few seconds while the app is open.">
        <Link to="/stocks" className="btn btn-primary">Place an order</Link>
      </PageHeader>
      <Segmented label="Order status" value={status} onChange={setStatus} options={[['all', `All (${orders.length})`], ...Object.entries(STATUS).map(([k, v]) => [k, `${v} (${counts[k]})`])]} />
      <section className="card flush" aria-label="Orders">
        {list.length === 0 ? (
          <EmptyState title="No orders here" action={<Link to="/stocks" className="btn">Browse market</Link>}>Orders you place from a stock page are listed with their status.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Orders</caption>
              <thead><tr><th scope="col">Placed</th><th scope="col">Order</th><th scope="col" className="num">Trigger</th><th scope="col" className="num">Market now</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id}>
                    <td>{dateTime(o.createdAt)}{scope === 'all' && <div className="muted small">{names[o.portfolioId]}</div>}</td>
                    <th scope="row"><span className={`badge ${o.side === 'buy' ? 'badge-gain' : 'badge-loss'}`}>{o.side.toUpperCase()}</span> {number(o.shares)} <Link to={`/stocks/${o.symbol}`}>{o.symbol}</Link> <span className="muted small">{o.type}</span></th>
                    <td className="num">{o.type === 'market' ? 'Market' : `${o.type === 'limit' ? 'Limit' : 'Stop'} ${money(o.limitPrice ?? o.stopPrice)}`}</td>
                    <td className="num">{bySymbol[o.symbol] ? money(bySymbol[o.symbol].price) : '—'}</td>
                    <td>
                      <span className={`badge ${TONE[o.status]}`}>{STATUS[o.status]}</span>
                      {o.status === 'filled' && <div className="muted small">at {money(o.fillPrice)}</div>}
                      {o.status === 'rejected' && <div className="muted small">{o.reason}</div>}
                    </td>
                    <td className="num">{o.status === 'open' && <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => cancel(o)} aria-label={`Cancel ${o.type} ${o.side} order for ${o.symbol}`}>Cancel</button>}</td>
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
