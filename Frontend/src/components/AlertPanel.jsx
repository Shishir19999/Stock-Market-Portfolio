import { useId, useState } from 'react';
import { useData, useToast } from '../context/hooks.js';
import { Field } from './ui.jsx';
import { validateAlert } from '../lib/finance.js';
import { money, dateTime } from '../lib/format.js';

/** Price alert form + list for one symbol (or all when `symbol` is omitted and a picker is shown). */
export default function AlertPanel({ symbol: fixedSymbol }) {
  const { alerts, addAlert, removeAlert, stocks, bySymbol } = useData();
  const toast = useToast();
  const uid = useId();
  const [symbol, setSymbol] = useState(fixedSymbol || '');
  const [direction, setDirection] = useState('above');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const sym = fixedSymbol || symbol;
  const list = alerts.filter((a) => !fixedSymbol || a.symbol === fixedSymbol);

  const submit = async (e) => {
    e.preventDefault();
    const msg = validateAlert({ symbol: sym, direction, target });
    setError(msg);
    if (msg) return;
    try {
      await addAlert({ symbol: sym, direction, target: Number(target) });
      toast.success(`Alert set: ${sym} ${direction} ${money(Number(target))}.`);
      setTarget('');
    } catch (err) {
      setError(err.message || 'Could not save the alert.');
    }
  };

  return (
    <section className="card stack-sm" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>Price alerts</h2>
      <form className="alert-form" onSubmit={submit} noValidate>
        {!fixedSymbol && (
          <Field id={`${uid}-sym`} label="Stock">
            <select id={`${uid}-sym`} value={symbol} onChange={(e) => { setSymbol(e.target.value); setError(''); }}>
              <option value="">Choose…</option>
              {stocks.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} - {s.company}</option>)}
            </select>
          </Field>
        )}
        <Field id={`${uid}-dir`} label="Notify me when price is">
          <select id={`${uid}-dir`} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="above">at or above</option>
            <option value="below">at or below</option>
          </select>
        </Field>
        <Field id={`${uid}-t`} label="Target price ($)" error={error} hint={sym && bySymbol[sym] ? `Now ${money(bySymbol[sym].price)}` : undefined}>
          <input
            id={`${uid}-t`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={target}
            onChange={(e) => { setTarget(e.target.value); if (error) setError(''); }}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${uid}-t-err` : sym ? `${uid}-t-hint` : undefined}
          />
        </Field>
        <button type="submit" className="btn btn-primary">Add alert</button>
      </form>
      {list.length === 0 ? (
        <p className="muted small">No alerts yet. You will get a notification here while the app is open.</p>
      ) : (
        <ul className="plain-list">
          {list.map((a) => (
            <li key={a.id} className="row between">
              <span>
                {!fixedSymbol && <strong>{a.symbol} </strong>}
                {a.direction === 'above' ? 'at or above' : 'at or below'} {money(a.target)}
                {a.triggeredAt && <span className="badge badge-gain"> Triggered {dateTime(a.triggeredAt)}</span>}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => removeAlert(a.id)} aria-label={`Delete alert for ${a.symbol} ${a.direction} ${money(a.target)}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
