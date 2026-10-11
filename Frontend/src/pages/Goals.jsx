import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { goalProgress, rebalance } from '@shared/finance.js';
import { useConfirm, useData, useTitle, useToast } from '../context/hooks.js';
import { Change, EmptyState, Field, PageHeader, Progress, StockSelect, Tabs, TabPanel } from '../components/ui.jsx';
import { dateOnly, money, number, plainPct } from '../lib/format.js';

const STATUS = { achieved: ['Achieved', 'badge-gain'], 'on-track': ['On track', 'badge-gain'], behind: ['Behind', 'badge-loss'], overdue: ['Past deadline', 'badge-loss'], 'in-progress': ['In progress', ''] };
const BLANK = { name: '', target: '', deadline: '', monthly: '', returnPct: '6', portfolioId: 'all' };

function GoalsTab() {
  const { goals, portfolios, valueOf, scope, createGoal, updateGoal, deleteGoal } = useData();
  const { confirm } = useConfirm();
  const toast = useToast();
  const uid = useId();
  const [f, setF] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState({ message: '', field: '' });
  const totalAll = useMemo(() => portfolios.reduce((s, p) => s + valueOf(p.id).totals.total, 0), [portfolios, valueOf]);
  const valueFor = (g) => (g.portfolioId === 'all' ? totalAll : valueOf(g.portfolioId).totals.total);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErr({ message: '', field: '' }); };
  const fe = (k) => (err.field === k ? err.message : undefined);

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editing) await updateGoal(editing, f);
      else await createGoal(f);
      toast.success(editing ? 'Goal updated.' : 'Goal created.');
      setF({ ...BLANK, portfolioId: scope !== 'all' ? scope : 'all' });
      setEditing(null);
    } catch (ex) {
      setErr({ message: ex.message, field: ex.field || '' });
    }
  };
  const edit = (g) => {
    setEditing(g.id);
    setF({ name: g.name, target: String(g.target), deadline: g.deadline || '', monthly: String(g.monthly || ''), returnPct: String(g.returnPct ?? 6), portfolioId: g.portfolioId });
  };
  const remove = async (g) => {
    if (await confirm({ title: `Delete "${g.name}"?`, message: 'This goal will be removed.', confirmLabel: 'Delete', danger: true })) {
      try {
        await deleteGoal(g.id);
        toast.success('Goal deleted.');
      } catch (ex) {
        toast.error(ex.message);
      }
    }
  };

  return (
    <>
      <section className="card" aria-labelledby="gl-h">
        <h2 id="gl-h">Your goals</h2>
        {goals.length === 0 ? <EmptyState title="No goals yet">Set a target value for your savings below.</EmptyState> : (
          <ul className="goal-list">
            {goals.map((g) => {
              const cur = valueFor(g);
              const gp = goalProgress(g, cur);
              const [label, cls] = STATUS[gp.status];
              return (
                <li key={g.id} className="goal">
                  <div className="row between wrap">
                    <div>
                      <h3>{g.name} <span className={`badge ${cls}`}>{label}</span></h3>
                      <span className="muted small">{g.portfolioId === 'all' ? 'All portfolios' : portfolios.find((p) => p.id === g.portfolioId)?.name}{g.deadline ? ` · by ${dateOnly(`${g.deadline}T12:00:00Z`)}` : ''}</span>
                    </div>
                    <div className="row"><button type="button" className="btn btn-sm" onClick={() => edit(g)}>Edit</button><button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => remove(g)} aria-label={`Delete goal ${g.name}`}>Delete</button></div>
                  </div>
                  <Progress value={gp.pct} label={`${g.name}: ${Math.round(gp.pct)} percent of ${money(g.target)}`} tone={gp.status === 'behind' || gp.status === 'overdue' ? 'loss' : 'primary'} />
                  <div className="row between wrap small"><span>{money(cur)} of {money(g.target)} ({plainPct(gp.pct, 0)})</span><span className="muted">{money(gp.remaining)} to go</span></div>
                  {gp.projected !== null && (
                    <p className="small muted">
                      Projected {money(gp.projected)} by the deadline with {money(g.monthly || 0)} per month at {g.returnPct}% a year.
                      {gp.status !== 'achieved' && gp.requiredMonthly > 0 && ` To hit the target you would need about ${money(gp.requiredMonthly)} per month.`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <form className="card stack-sm" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
        <h2 id={`${uid}-h`}>{editing ? 'Edit goal' : 'New goal'}</h2>
        <div className="form-grid">
          <Field id={`${uid}-n`} label="Name" error={fe('name')}><input id={`${uid}-n`} maxLength={60} value={f.name} onChange={set('name')} /></Field>
          <Field id={`${uid}-t`} label="Target value" error={fe('target')}><input id={`${uid}-t`} type="number" min="0" step="any" value={f.target} onChange={set('target')} /></Field>
          <Field id={`${uid}-d`} label="Deadline (optional)" error={fe('deadline')}><input id={`${uid}-d`} type="date" value={f.deadline} onChange={set('deadline')} /></Field>
          <Field id={`${uid}-m`} label="Monthly contribution" error={fe('monthly')}><input id={`${uid}-m`} type="number" min="0" step="any" value={f.monthly} onChange={set('monthly')} /></Field>
          <Field id={`${uid}-r`} label="Expected return % per year" error={fe('returnPct')}><input id={`${uid}-r`} type="number" step="any" value={f.returnPct} onChange={set('returnPct')} /></Field>
          <Field id={`${uid}-p`} label="Track">
            <select id={`${uid}-p`} value={f.portfolioId} onChange={set('portfolioId')}><option value="all">All portfolios</option>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </Field>
        </div>
        {err.message && !err.field && <div className="form-error" role="alert">{err.message}</div>}
        <div className="row"><button type="submit" className="btn btn-primary">{editing ? 'Save goal' : 'Add goal'}</button>{editing && <button type="button" className="btn" onClick={() => { setEditing(null); setF(BLANK); }}>Cancel</button>}</div>
        <p className="muted small">Projections are simple estimates (monthly compounding) and not a forecast. Progress uses live portfolio values.</p>
      </form>
    </>
  );
}

function RebalanceTab() {
  const { portfolios, scope, valueOf, prices, stocks, updatePortfolio, placeOrder } = useData();
  const { confirm } = useConfirm();
  const toast = useToast();
  const uid = useId();
  const [pid, setPid] = useState(scope !== 'all' ? scope : portfolios[0]?.id);
  const active = portfolios.find((p) => p.id === pid) || portfolios[0];
  const val = valueOf(active.id);
  const [draft, setDraft] = useState({ id: null, targets: {} });
  const targets = draft.id === active.id ? draft.targets : Object.fromEntries(Object.entries(active.targets || {}).map(([k, v]) => [k, String(v)]));
  const dirty = draft.id === active.id;
  const [add, setAdd] = useState('');
  const [err, setErr] = useState('');

  const symbols = [...new Set([...val.positions.map((p) => p.symbol), ...Object.keys(targets)])];
  const sum = symbols.reduce((s, k) => s + (Number(targets[k]) || 0), 0);
  const numeric = Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, Number(v) || 0]).filter(([, v]) => v > 0));
  const rows = rebalance(val.positions, val.totals.cash, numeric, prices);
  const options = stocks.filter((s) => !symbols.includes(s.symbol));
  const choice = add && options.some((s) => s.symbol === add) ? add : options[0]?.symbol || '';
  const setT = (sym, v) => setDraft({ id: active.id, targets: { ...targets, [sym]: v } });

  const save = async () => {
    try {
      await updatePortfolio(active.id, { targets: numeric });
      toast.success('Targets saved.');
      setDraft({ id: null, targets: {} });
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  };
  const trade = async (r) => {
    const ok = await confirm({ title: `${r.side === 'buy' ? 'Buy' : 'Sell'} ${r.shares} ${r.symbol}?`, message: `Places a market order for about ${money(r.amount)} in ${active.name}.`, confirmLabel: r.side === 'buy' ? 'Buy' : 'Sell' });
    if (!ok) return;
    try {
      await placeOrder({ portfolioId: active.id, symbol: r.symbol, side: r.side, type: 'market', shares: r.shares });
      toast.success(`${r.side === 'buy' ? 'Bought' : 'Sold'} ${r.shares} ${r.symbol}.`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <section className="card stack-sm" aria-labelledby={`${uid}-h`}>
        <h2 id={`${uid}-h`}>Target allocation</h2>
        {portfolios.length > 1 && (
          <Field id={`${uid}-pf`} label="Portfolio">
            <select id={`${uid}-pf`} value={active.id} onChange={(e) => { setPid(e.target.value); setDraft({ id: null, targets: {} }); }}>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </Field>
        )}
        <p className="muted small">Set the percentage of the portfolio you want in each stock. The rest stays in cash.</p>
        {symbols.length === 0 ? <EmptyState title="No holdings or targets">Add a stock below to set a target.</EmptyState> : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Target weights</caption>
              <thead><tr><th scope="col">Stock</th><th scope="col" className="num">Current</th><th scope="col" className="num">Target %</th></tr></thead>
              <tbody>
                {symbols.map((sym) => {
                  const pos = val.positions.find((p) => p.symbol === sym);
                  return (
                    <tr key={sym}>
                      <th scope="row"><Link to={`/stocks/${sym}`}>{sym}</Link></th>
                      <td className="num">{plainPct(pos && val.totals.total ? (pos.value / val.totals.total) * 100 : 0)}</td>
                      <td className="num"><label className="sr-only" htmlFor={`${uid}-${sym}`}>Target percent for {sym}</label><input id={`${uid}-${sym}`} className="pct-input" type="number" min="0" max="100" step="0.5" value={targets[sym] ?? ''} onChange={(e) => setT(sym, e.target.value)} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><th scope="row">Total</th><td className="num" /><td className="num"><strong className={sum > 100.01 ? 'loss' : ''}>{plainPct(sum)}</strong> <span className="muted small">(cash {plainPct(Math.max(0, 100 - sum))})</span></td></tr></tfoot>
            </table>
          </div>
        )}
        <div className="row wrap pick-row">
          <StockSelect id={`${uid}-add`} label="Add a stock" value={choice} onChange={setAdd} stocks={options} />
          <button type="button" className="btn" disabled={!choice} onClick={() => { setT(choice, '5'); setAdd(''); }}>Add target</button>
        </div>
        {err && <div className="form-error" role="alert">{err}</div>}
        {sum > 100.01 && <div className="form-error" role="alert">Targets add up to more than 100%.</div>}
        <div className="row"><button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || sum > 100.01}>Save targets</button>{dirty && <button type="button" className="btn" onClick={() => setDraft({ id: null, targets: {} })}>Discard changes</button>}</div>
      </section>

      <section className="card" aria-labelledby={`${uid}-rb`}>
        <h2 id={`${uid}-rb`}>Rebalancing suggestions</h2>
        {rows.length === 0 ? <EmptyState title="Set targets to see suggestions">Suggestions compare your current weights with the targets above.</EmptyState> : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Suggested trades to reach target weights</caption>
              <thead><tr><th scope="col">Stock</th><th scope="col" className="num">Current</th><th scope="col" className="num">Target</th><th scope="col" className="num">Drift</th><th scope="col">Suggestion</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol}>
                    <th scope="row">{r.symbol}</th>
                    <td className="num">{plainPct(r.current)}</td><td className="num">{plainPct(r.target)}</td><td className="num"><Change value={r.drift} /></td>
                    <td>{r.action === 'hold' ? <span className="muted">Within tolerance</span> : <span><span className={`badge ${r.side === 'buy' ? 'badge-gain' : 'badge-loss'}`}>{r.side.toUpperCase()}</span> {number(r.shares)} shares (about {money(r.amount)})</span>}</td>
                    <td className="num">{r.action !== 'hold' && <button type="button" className="btn btn-sm" onClick={() => trade(r)}>Place market order</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">Suggestions use whole shares at current prices and ignore commissions. They are paper-trading ideas, not advice.</p>
      </section>
    </>
  );
}

export default function Goals() {
  useTitle('Goals and rebalancing');
  const [tab, setTab] = useState('goals');
  return (
    <>
      <PageHeader title="Goals and rebalancing" subtitle="Track progress toward a target value and keep your allocation on plan." />
      <Tabs label="Goals views" value={tab} onChange={setTab} tabs={[{ id: 'goals', label: 'Goals' }, { id: 'rebalance', label: 'Targets and rebalancing' }]} />
      <TabPanel id="goals" value={tab}><GoalsTab /></TabPanel>
      <TabPanel id="rebalance" value={tab}><RebalanceTab /></TabPanel>
    </>
  );
}
