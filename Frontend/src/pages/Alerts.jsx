import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, useTitle, useToast } from '../context/hooks.js';
import { EmptyState, Field, PageHeader, StockSelect } from '../components/ui.jsx';
import { dateTime, money } from '../lib/format.js';

export default function Alerts() {
  useTitle('Alerts');
  const { alerts, stocks, bySymbol, createAlert, deleteAlert } = useData();
  const toast = useToast();
  const uid = useId();
  const [symbol, setSymbol] = useState(stocks[0]?.symbol || '');
  const [direction, setDirection] = useState('above');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');

  const add = async (e) => {
    e.preventDefault();
    try {
      await createAlert({ symbol, direction, target });
      toast.success(`Alert set for ${symbol}.`);
      setTarget('');
      setError('');
    } catch (ex) {
      setError(ex.message);
    }
  };
  const active = alerts.filter((a) => !a.triggeredAt);
  const done = alerts.filter((a) => a.triggeredAt);

  return (
    <>
      <PageHeader title="Price alerts" subtitle="Get a notification (bell icon, and a message on screen) when a stock crosses your target. Alerts are checked every few seconds while the app is open." />
      <form className="card stack-sm" onSubmit={add} noValidate aria-labelledby={`${uid}-h`}>
        <h2 id={`${uid}-h`}>New alert</h2>
        <div className="form-grid">
          <StockSelect id={`${uid}-s`} value={symbol} onChange={setSymbol} stocks={stocks} />
          <Field id={`${uid}-d`} label="When price is">
            <select id={`${uid}-d`} value={direction} onChange={(e) => setDirection(e.target.value)}><option value="above">At or above</option><option value="below">At or below</option></select>
          </Field>
          <Field id={`${uid}-t`} label="Target price" error={error} hint={bySymbol[symbol] ? `Now ${money(bySymbol[symbol].price)}` : undefined}>
            <input id={`${uid}-t`} type="number" min="0" step="0.01" inputMode="decimal" value={target} onChange={(e) => { setTarget(e.target.value); setError(''); }} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${uid}-t-err` : `${uid}-t-hint`} />
          </Field>
        </div>
        <div><button type="submit" className="btn btn-primary">Add alert</button></div>
      </form>

      <section className="card" aria-labelledby="act-h">
        <h2 id="act-h">Active alerts ({active.length})</h2>
        {active.length === 0 ? <EmptyState title="No active alerts">Create one above, or from any stock page.</EmptyState> : (
          <ul className="plain-list">
            {active.map((a) => (
              <li key={a.id}>
                <span><Link to={`/stocks/${a.symbol}`}><strong>{a.symbol}</strong></Link> {a.direction === 'above' ? 'at or above' : 'at or below'} <strong>{money(a.target)}</strong> <span className="muted small">(now {money(bySymbol[a.symbol]?.price)})</span></span>
                <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => deleteAlert(a.id)} aria-label={`Delete alert for ${a.symbol} ${a.direction} ${money(a.target)}`}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <section className="card" aria-labelledby="trig-h">
          <h2 id="trig-h">Triggered ({done.length})</h2>
          <ul className="plain-list">
            {done.map((a) => (
              <li key={a.id}>
                <span><strong>{a.symbol}</strong> {a.direction} {money(a.target)} <span className="badge badge-gain">{dateTime(a.triggeredAt)}</span></span>
                <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => deleteAlert(a.id)} aria-label={`Delete triggered alert for ${a.symbol}`}>Delete</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
