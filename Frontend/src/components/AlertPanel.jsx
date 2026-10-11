import { useId, useState } from 'react';
import { useData, useToast } from '../context/hooks.js';
import { Field } from './ui.jsx';
import { money, dateTime } from '../lib/format.js';

/** Price alerts for one stock: create and remove. Triggered alerts also raise a notification. */
export default function AlertPanel({ symbol }) {
  const { alerts, createAlert, deleteAlert, bySymbol } = useData();
  const toast = useToast();
  const uid = useId();
  const [direction, setDirection] = useState('above');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const mine = alerts.filter((a) => a.symbol === symbol);
  const price = bySymbol[symbol]?.price;

  const add = async (e) => {
    e.preventDefault();
    if (!(Number(target) > 0)) {
      setError('Enter a target price greater than zero.');
      return;
    }
    try {
      await createAlert({ symbol, direction, target });
      setTarget('');
      setError('');
      toast.success(`Alert set: ${symbol} ${direction} ${money(Number(target))}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="card stack-sm" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>Price alerts</h2>
      <form className="alert-form" onSubmit={add} noValidate>
        <Field id={`${uid}-dir`} label="Notify me when the price is">
          <select id={`${uid}-dir`} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="above">At or above</option>
            <option value="below">At or below</option>
          </select>
        </Field>
        <Field id={`${uid}-t`} label="Target price" error={error} hint={price ? `Current ${money(price)}` : undefined}>
          <input id={`${uid}-t`} type="number" inputMode="decimal" min="0" step="0.01" value={target} onChange={(e) => { setTarget(e.target.value); setError(''); }} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${uid}-t-err` : `${uid}-t-hint`} />
        </Field>
        <button type="submit" className="btn">Add alert</button>
      </form>
      {mine.length === 0 ? (
        <p className="muted small">No alerts for {symbol} yet.</p>
      ) : (
        <ul className="plain-list">
          {mine.map((a) => (
            <li key={a.id}>
              <span>
                {a.direction === 'above' ? 'At or above' : 'At or below'} <strong>{money(a.target)}</strong>
                {a.triggeredAt && <span className="badge badge-gain">Triggered {dateTime(a.triggeredAt)}</span>}
              </span>
              <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => deleteAlert(a.id)} aria-label={`Delete alert ${a.direction} ${money(a.target)}`}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
