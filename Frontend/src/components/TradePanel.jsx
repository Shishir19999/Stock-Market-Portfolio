import { useId, useState } from 'react';
import { useData, useToast } from '../context/hooks.js';
import { Field } from './ui.jsx';
import { money, number } from '../lib/format.js';

/** Buy/sell form with inline validation. `stock` is a decorated catalogue entry (live price). */
export default function TradePanel({ stock }) {
  const { account, portfolio, trade } = useData();
  const toast = useToast();
  const uid = useId();
  const [side, setSide] = useState('buy');
  const [qty, setQty] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const owned = account.holdings.find((h) => h.symbol === stock.symbol)?.shares || 0;
  const shares = Number(qty);
  const total = Number.isFinite(shares) ? shares * stock.price : 0;
  const maxBuy = Math.floor(account.cash / stock.price);

  const validate = () => {
    if (qty.trim() === '') return 'Enter the number of shares.';
    if (!Number.isInteger(shares) || shares <= 0) return 'Enter a whole number greater than zero.';
    if (side === 'buy' && total > account.cash + 1e-9) return `Not enough cash. You can afford up to ${number(maxBuy)} shares.`;
    if (side === 'sell' && shares > owned) return `You only own ${number(owned)} shares.`;
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    const msg = validate();
    setError(msg);
    if (msg) return;
    setBusy(true);
    try {
      const tx = await trade({ symbol: stock.symbol, side, shares, price: stock.price });
      toast.success(`${side === 'buy' ? 'Bought' : 'Sold'} ${number(tx.shares)} ${stock.symbol} at ${money(tx.price)}.`);
      setQty('');
    } catch (err) {
      setError(err.message || 'The order could not be placed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack-sm" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>Trade {stock.symbol}</h2>
      <div className="segmented" role="group" aria-label="Order side">
        {['buy', 'sell'].map((s) => (
          <button key={s} type="button" className={side === s ? 'on' : ''} aria-pressed={side === s} onClick={() => { setSide(s); setError(''); }}>
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      <dl className="kv">
        <div><dt>Market price</dt><dd>{money(stock.price)}</dd></div>
        <div><dt>Cash available</dt><dd>{money(account.cash)}</dd></div>
        <div><dt>You own</dt><dd>{number(owned)} shares</dd></div>
      </dl>
      <Field id={`${uid}-qty`} label="Shares" error={error} hint={side === 'buy' ? `Up to ${number(maxBuy)} affordable` : `Up to ${number(owned)} to sell`}>
        <input
          id={`${uid}-qty`}
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={qty}
          onChange={(e) => { setQty(e.target.value); if (error) setError(''); }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${uid}-qty-err` : `${uid}-qty-hint`}
          placeholder="e.g. 10"
        />
      </Field>
      <div className="row between">
        <span className="muted">Order value</span>
        <strong>{money(Number.isFinite(total) ? total : 0)}</strong>
      </div>
      <button type="submit" className={`btn ${side === 'buy' ? 'btn-primary' : 'btn-danger'}`} disabled={busy}>
        {busy ? 'Placing order…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${stock.symbol}`}
      </button>
      <p className="muted small">Portfolio value {money(portfolio.totals.total)}. Paper trade at the simulated market price.</p>
    </form>
  );
}
