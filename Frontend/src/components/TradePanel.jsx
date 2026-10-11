import { useId, useState } from 'react';
import { useData, useToast } from '../context/hooks.js';
import { Field } from './ui.jsx';
import { money, number } from '../lib/format.js';

const TYPES = [['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop']];
const TYPE_HELP = {
  market: 'Fills immediately at the current price.',
  limit: 'Fills when the price is at or better than your limit (buy at or below, sell at or above).',
  stop: 'Triggers when the price reaches your stop (sell at or below, buy at or above), then fills at the market price.',
};

/** Buy/sell form with market, limit and stop orders. `stock` is a decorated catalogue entry (live price). */
export default function TradePanel({ stock }) {
  const { portfolios, scope, ledgers, settings, placeOrder } = useData();
  const toast = useToast();
  const uid = useId();
  const [pid, setPid] = useState(scope !== 'all' ? scope : portfolios[0]?.id);
  const [side, setSide] = useState('buy');
  const [type, setType] = useState('market');
  const [qty, setQty] = useState('');
  const [trigger, setTrigger] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const activePid = portfolios.some((p) => p.id === pid) ? pid : portfolios[0]?.id;
  const ledger = ledgers[activePid];
  const cash = ledger?.cash ?? 0;
  const owned = ledger?.positions.find((h) => h.symbol === stock.symbol)?.shares || 0;
  const shares = Number(qty);
  const refPrice = type === 'market' || !Number(trigger) ? stock.price : Number(trigger);
  const total = Number.isFinite(shares) ? shares * refPrice : 0;
  const fee = settings.commission || 0;
  const maxBuy = Math.max(0, Math.floor((cash - fee) / stock.price));

  const validate = () => {
    if (qty.trim() === '') return 'Enter the number of shares.';
    if (!Number.isInteger(shares) || shares <= 0) return 'Enter a whole number greater than zero.';
    if (type !== 'market' && !(Number(trigger) > 0)) return `Enter a ${type} price greater than zero.`;
    if (side === 'buy' && type === 'market' && total + fee > cash + 1e-9) return `Not enough cash. You can afford up to ${number(maxBuy)} shares.`;
    if (side === 'sell' && shares > owned) return `You only own ${number(owned)} shares in this portfolio.`;
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    const msg = validate();
    setError(msg);
    if (msg) return;
    setBusy(true);
    try {
      const res = await placeOrder({
        portfolioId: activePid, symbol: stock.symbol, side, type, shares,
        ...(type === 'limit' ? { limitPrice: trigger } : {}), ...(type === 'stop' ? { stopPrice: trigger } : {}),
      });
      toast.success(
        res.tx
          ? `${side === 'buy' ? 'Bought' : 'Sold'} ${number(res.tx.shares)} ${stock.symbol} at ${money(res.tx.price)}.`
          : `${type[0].toUpperCase()}${type.slice(1)} order placed. It fills automatically when the price allows.`,
      );
      setQty('');
      setTrigger('');
    } catch (err) {
      setError(err.message || 'The order could not be placed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack-sm" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>Trade {stock.symbol}</h2>
      {portfolios.length > 1 && (
        <Field id={`${uid}-pf`} label="Portfolio">
          <select id={`${uid}-pf`} value={activePid} onChange={(e) => { setPid(e.target.value); setError(''); }}>
            {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}
      <div className="segmented" role="group" aria-label="Order side">
        {['buy', 'sell'].map((s) => (
          <button key={s} type="button" className={side === s ? 'on' : ''} aria-pressed={side === s} onClick={() => { setSide(s); setError(''); }}>
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      <Field id={`${uid}-type`} label="Order type" hint={TYPE_HELP[type]}>
        <select id={`${uid}-type`} value={type} onChange={(e) => { setType(e.target.value); setError(''); }} aria-describedby={`${uid}-type-hint`}>
          {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <dl className="kv">
        <div><dt>Market price</dt><dd>{money(stock.price)}</dd></div>
        <div><dt>Cash available</dt><dd>{money(cash)}</dd></div>
        <div><dt>You own</dt><dd>{number(owned)} shares</dd></div>
      </dl>
      {type !== 'market' && (
        <Field id={`${uid}-trg`} label={type === 'limit' ? 'Limit price' : 'Stop price'}>
          <input id={`${uid}-trg`} type="number" inputMode="decimal" min="0" step="0.01" value={trigger} onChange={(e) => { setTrigger(e.target.value); if (error) setError(''); }} placeholder={stock.price.toFixed(2)} />
        </Field>
      )}
      <Field id={`${uid}-qty`} label="Shares" error={error} hint={side === 'buy' ? `Up to ${number(maxBuy)} affordable at market` : `Up to ${number(owned)} to sell`}>
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
        <span className="muted">Estimated value{fee ? ` (+${money(fee)} commission)` : ''}</span>
        <strong>{money(Number.isFinite(total) ? total : 0)}</strong>
      </div>
      <button type="submit" className={`btn ${side === 'buy' ? 'btn-primary' : 'btn-danger'}`} disabled={busy}>
        {busy ? 'Placing order…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${stock.symbol}`}
      </button>
      <p className="muted small">Paper trade at simulated prices. Limit and stop orders are checked every few seconds while this page is open.</p>
    </form>
  );
}
