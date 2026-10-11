import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { COST_METHODS } from '@shared/finance.js';
import { useConfirm, useData, useTitle, useToast } from '../context/hooks.js';
import { Change, Field, PageHeader } from '../components/ui.jsx';
import { money, tone } from '../lib/format.js';

function NewPortfolio() {
  const { createPortfolio, settings } = useData();
  const toast = useToast();
  const uid = useId();
  const [f, setF] = useState({ name: '', method: 'FIFO', startingCash: String(settings.startingCash ?? 0) });
  const [err, setErr] = useState({ message: '', field: '' });
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErr({ message: '', field: '' }); };
  const submit = async (e) => {
    e.preventDefault();
    try {
      await createPortfolio(f);
      toast.success(`Portfolio "${f.name}" created.`);
      setF({ name: '', method: 'FIFO', startingCash: '0' });
    } catch (ex) {
      setErr({ message: ex.message, field: ex.field || '' });
    }
  };
  return (
    <form className="card stack-sm" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>New portfolio</h2>
      <div className="form-grid">
        <Field id={`${uid}-n`} label="Name" error={err.field === 'name' ? err.message : undefined}><input id={`${uid}-n`} maxLength={40} value={f.name} onChange={set('name')} /></Field>
        <Field id={`${uid}-m`} label="Cost basis method" hint="How the cost of shares sold is worked out.">
          <select id={`${uid}-m`} value={f.method} onChange={set('method')} aria-describedby={`${uid}-m-hint`}>{Object.entries(COST_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field id={`${uid}-c`} label="Starting cash" error={err.field === 'startingCash' ? err.message : undefined}><input id={`${uid}-c`} type="number" min="0" step="any" value={f.startingCash} onChange={set('startingCash')} /></Field>
      </div>
      {err.message && !err.field && <div className="form-error" role="alert">{err.message}</div>}
      <div><button type="submit" className="btn btn-primary">Create portfolio</button></div>
    </form>
  );
}

function PortfolioCard({ p, count }) {
  const { valueOf, updatePortfolio, deletePortfolio, addTransaction, setScope, scope } = useData();
  const { confirm } = useConfirm();
  const toast = useToast();
  const uid = useId();
  const [mode, setMode] = useState(null); // 'edit' | 'cash'
  const [name, setName] = useState(p.name);
  const [method, setMethod] = useState(p.method);
  const [cash, setCash] = useState({ type: 'deposit', amount: '' });
  const [err, setErr] = useState('');
  const { totals } = valueOf(p.id);

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      setErr('');
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    }
  };
  const save = async (e) => {
    e.preventDefault();
    if (await run(() => updatePortfolio(p.id, { name, method }), 'Portfolio updated.')) setMode(null);
  };
  const move = async (e) => {
    e.preventDefault();
    const ok = await run(() => addTransaction({ portfolioId: p.id, type: cash.type, amount: cash.amount, date: new Date().toISOString(), note: cash.type === 'deposit' ? 'Deposit' : 'Withdrawal' }), cash.type === 'deposit' ? 'Cash deposited.' : 'Cash withdrawn.');
    if (ok) setCash({ type: cash.type, amount: '' });
  };
  const remove = async () => {
    const ok = await confirm({ title: `Delete "${p.name}"?`, message: 'Its transactions and orders are deleted permanently.', confirmLabel: 'Delete portfolio', danger: true });
    if (ok) run(() => deletePortfolio(p.id), 'Portfolio deleted.');
  };

  return (
    <section className="card stack-sm" aria-labelledby={`${uid}-h`}>
      <div className="row between wrap">
        <div>
          <h2 id={`${uid}-h`}>{p.name}</h2>
          <span className="badge">{COST_METHODS[p.method]}</span> {scope === p.id && <span className="badge badge-gain">Selected</span>}
        </div>
        <div className="row wrap">
          <button type="button" className="btn btn-sm" onClick={() => setScope(p.id)} disabled={scope === p.id}>Select</button>
          <button type="button" className="btn btn-sm" aria-expanded={mode === 'cash'} onClick={() => setMode(mode === 'cash' ? null : 'cash')}>Cash</button>
          <button type="button" className="btn btn-sm" aria-expanded={mode === 'edit'} onClick={() => { setName(p.name); setMethod(p.method); setMode(mode === 'edit' ? null : 'edit'); }}>Edit</button>
          <button type="button" className="btn btn-sm btn-danger-ghost" onClick={remove} disabled={count < 2} title={count < 2 ? 'You need at least one portfolio' : undefined}>Delete</button>
        </div>
      </div>
      <dl className="kv grid-kv">
        <div><dt>Total value</dt><dd>{money(totals.total)}</dd></div>
        <div><dt>Cash</dt><dd>{money(totals.cash)}</dd></div>
        <div><dt>Invested</dt><dd>{money(totals.invested)}</dd></div>
        <div><dt>Total gain</dt><dd><span className={tone(totals.gain)}>{money(totals.gain)}</span> <Change value={totals.gainPct} /></dd></div>
        <div><dt>Unrealized</dt><dd className={tone(totals.unrealized)}>{money(totals.unrealized)}</dd></div>
        <div><dt>Realized</dt><dd className={tone(totals.realized)}>{money(totals.realized)}</dd></div>
      </dl>
      {mode === 'edit' && (
        <form className="stack-sm edit-box" onSubmit={save} noValidate>
          <div className="form-grid">
            <Field id={`${uid}-n`} label="Name"><input id={`${uid}-n`} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field id={`${uid}-m`} label="Cost basis method"><select id={`${uid}-m`} value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(COST_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <div className="row"><button type="submit" className="btn btn-primary btn-sm">Save</button><button type="button" className="btn btn-sm" onClick={() => setMode(null)}>Cancel</button></div>
        </form>
      )}
      {mode === 'cash' && (
        <form className="stack-sm edit-box" onSubmit={move} noValidate>
          <div className="form-grid">
            <Field id={`${uid}-t`} label="Action"><select id={`${uid}-t`} value={cash.type} onChange={(e) => setCash({ ...cash, type: e.target.value })}><option value="deposit">Deposit cash</option><option value="withdraw">Withdraw cash</option></select></Field>
            <Field id={`${uid}-a`} label="Amount"><input id={`${uid}-a`} type="number" min="0" step="0.01" value={cash.amount} onChange={(e) => setCash({ ...cash, amount: e.target.value })} /></Field>
          </div>
          <div><button type="submit" className="btn btn-primary btn-sm">{cash.type === 'deposit' ? 'Deposit' : 'Withdraw'}</button></div>
        </form>
      )}
      {err && <div className="form-error" role="alert">{err}</div>}
      <p className="small"><Link to="/transactions">View transactions</Link> · <Link to="/goals">Targets and rebalancing</Link></p>
    </section>
  );
}

export default function Portfolios() {
  useTitle('Portfolios');
  const { portfolios } = useData();
  return (
    <>
      <PageHeader title="Portfolios" subtitle="Keep separate portfolios (for example growth and retirement), each with its own cash and cost basis method." />
      <div className="grid two">{portfolios.map((p) => <PortfolioCard key={p.id} p={p} count={portfolios.length} />)}</div>
      <NewPortfolio />
    </>
  );
}
