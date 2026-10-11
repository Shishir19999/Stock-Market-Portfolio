import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseTransactionsCsv, TRANSACTION_COLUMNS } from '@shared/csv.js';
import { TX_TYPES } from '@shared/finance.js';
import { useConfirm, useData, useTitle, useToast } from '../context/hooks.js';
import { EmptyState, Field, PageHeader, StockSelect, Tabs, TabPanel } from '../components/ui.jsx';
import { downloadCsv, toCsv } from '../lib/download.js';
import { dateOnly, money, number } from '../lib/format.js';

const PAGE = 15;
const TYPE_LABEL = { buy: 'Buy', sell: 'Sell', dividend: 'Dividend', deposit: 'Deposit', withdraw: 'Withdraw' };
const TEMPLATE = 'date,type,symbol,shares,price,fee,amount,note\n2026-01-05,deposit,,,,,10000,Starting cash\n2026-01-06,buy,AAPL,10,1.50,0,,First purchase\n2026-02-01,dividend,AAPL,,,,2.50,Dividend\n';

function AddForm({ onDone }) {
  const { portfolios, scope, stocks, addTransaction } = useData();
  const toast = useToast();
  const uid = useId();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ portfolioId: scope !== 'all' ? scope : portfolios[0]?.id, type: 'buy', date: today, symbol: stocks[0]?.symbol || '', shares: '', price: '', fee: '', amount: '', note: '' });
  const [err, setErr] = useState({ message: '', field: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErr({ message: '', field: '' }); };
  const trade = f.type === 'buy' || f.type === 'sell';
  const needsSymbol = trade || f.type === 'dividend';
  const fieldErr = (k) => (err.field === k ? err.message : undefined);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await addTransaction({ ...f, symbol: needsSymbol ? f.symbol : undefined });
      toast.success('Transaction added.');
      onDone();
    } catch (ex) {
      setErr({ message: ex.message, field: ex.field || '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack-sm" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>Add a transaction</h2>
      <div className="form-grid">
        <Field id={`${uid}-pf`} label="Portfolio">
          <select id={`${uid}-pf`} value={f.portfolioId} onChange={set('portfolioId')}>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
        <Field id={`${uid}-type`} label="Type" error={fieldErr('type')}>
          <select id={`${uid}-type`} value={f.type} onChange={set('type')}>{TX_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
        </Field>
        <Field id={`${uid}-date`} label="Date" error={fieldErr('date')}>
          <input id={`${uid}-date`} type="date" value={f.date} onChange={set('date')} max={today} />
        </Field>
        {needsSymbol && <StockSelect id={`${uid}-sym`} value={f.symbol} onChange={(v) => setF((x) => ({ ...x, symbol: v }))} stocks={stocks} />}
        {trade && (
          <>
            <Field id={`${uid}-sh`} label="Shares" error={fieldErr('shares')}><input id={`${uid}-sh`} type="number" min="0" step="any" value={f.shares} onChange={set('shares')} /></Field>
            <Field id={`${uid}-pr`} label="Price per share" error={fieldErr('price')}><input id={`${uid}-pr`} type="number" min="0" step="any" value={f.price} onChange={set('price')} /></Field>
            <Field id={`${uid}-fee`} label="Fee (optional)" error={fieldErr('fee')}><input id={`${uid}-fee`} type="number" min="0" step="any" value={f.fee} onChange={set('fee')} /></Field>
          </>
        )}
        {!trade && <Field id={`${uid}-am`} label="Amount" error={fieldErr('amount')}><input id={`${uid}-am`} type="number" min="0" step="any" value={f.amount} onChange={set('amount')} /></Field>}
        <Field id={`${uid}-note`} label="Note (optional)"><input id={`${uid}-note`} maxLength={200} value={f.note} onChange={set('note')} /></Field>
      </div>
      {err.message && !err.field && <div className="form-error" role="alert">{err.message}</div>}
      <div className="row"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add transaction'}</button><button type="button" className="btn" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

function ImportPanel({ onDone }) {
  const { portfolios, scope, symbols, importTransactions } = useData();
  const toast = useToast();
  const uid = useId();
  const [pid, setPid] = useState(scope !== 'all' ? scope : portfolios[0]?.id);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (text.trim() ? parseTransactionsCsv(text, { symbols }) : null), [text, symbols]);

  const readFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setError('That file is larger than 1 MB.');
      return;
    }
    setError('');
    setText(await file.text());
  };
  const run = async () => {
    setBusy(true);
    try {
      const res = await importTransactions(pid, parsed.rows.map((r) => r.tx));
      toast.success(`Imported ${res.imported} transactions.`);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack-sm" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>Import from CSV</h2>
      <p className="muted small">
        Columns: <code>date,type,symbol,shares,price,fee,amount,note</code>. Types: buy, sell, dividend, deposit, withdraw. Common alternatives such as ticker, quantity and action are recognised. The whole file is checked first and nothing is saved if any row is invalid.
      </p>
      <div className="form-grid">
        <Field id={`${uid}-pf`} label="Import into">
          <select id={`${uid}-pf`} value={pid} onChange={(e) => setPid(e.target.value)}>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
        <Field id={`${uid}-file`} label="CSV file"><input id={`${uid}-file`} type="file" accept=".csv,text/csv" onChange={readFile} /></Field>
      </div>
      <Field id={`${uid}-txt`} label="Or paste CSV text">
        <textarea id={`${uid}-txt`} rows={5} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} spellCheck={false} />
      </Field>
      <div className="row wrap">
        <button type="button" className="btn btn-sm" onClick={() => downloadCsv('transactions-template.csv', TEMPLATE)}>Download template</button>
      </div>
      {parsed && (
        <div aria-live="polite" className="stack-sm">
          <p><strong>{parsed.rows.length}</strong> valid {parsed.rows.length === 1 ? 'row' : 'rows'}, <strong>{parsed.errors.length}</strong> with problems.</p>
          {parsed.errors.length > 0 && (
            <ul className="error-list">{parsed.errors.slice(0, 8).map((e) => <li key={e.line}>Line {e.line}: {e.message}</li>)}{parsed.errors.length > 8 && <li>and {parsed.errors.length - 8} more</li>}</ul>
          )}
        </div>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy || !parsed || parsed.errors.length > 0 || parsed.rows.length === 0}>{busy ? 'Importing…' : 'Import transactions'}</button>
        <button type="button" className="btn" onClick={onDone}>Close</button>
      </div>
    </section>
  );
}

export default function Transactions() {
  useTitle('Transactions');
  const { transactions, scope, portfolios, deleteTransaction } = useData();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [panel, setPanel] = useState(null); // null | 'add' | 'import'
  const [f, setF] = useState({ type: 'all', symbol: '', from: '', to: '', q: '' });
  const [page, setPage] = useState(1);
  const [dir, setDir] = useState('desc');
  const [tab, setTab] = useState('all');
  const names = Object.fromEntries(portfolios.map((p) => [p.id, p.name]));

  const inScope = useMemo(() => (scope === 'all' ? transactions : transactions.filter((t) => t.portfolioId === scope)), [transactions, scope]);
  const filtered = useMemo(() => {
    const sym = f.symbol.trim().toUpperCase();
    const q = f.q.trim().toLowerCase();
    const out = inScope.filter((t) => {
      if (f.type !== 'all' && t.type !== f.type) return false;
      if (sym && !(t.symbol || '').includes(sym)) return false;
      if (f.from && t.date.slice(0, 10) < f.from) return false;
      if (f.to && t.date.slice(0, 10) > f.to) return false;
      if (q && !`${t.note || ''} ${t.symbol || ''} ${t.type}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) => (dir === 'desc' ? (a.date < b.date ? 1 : -1) : a.date < b.date ? -1 : 1));
  }, [inScope, f, dir]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(1); };
  const filtersOn = f.type !== 'all' || f.symbol || f.from || f.to || f.q;
  const net = filtered.reduce((s, t) => s + (t.type === 'buy' ? -(t.amount + (t.fee || 0)) : t.type === 'sell' ? t.amount - (t.fee || 0) : t.type === 'withdraw' ? -t.amount : t.amount), 0);

  const remove = async (t) => {
    const ok = await confirm({ title: 'Delete this transaction?', message: `${TYPE_LABEL[t.type]} ${t.symbol || ''} on ${dateOnly(t.date)}. Deleting is blocked if later activity depends on it.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await deleteTransaction(t.id);
      toast.success('Transaction deleted.');
    } catch (e) {
      toast.error(e.message);
    }
  };
  const exportCsv = () => downloadCsv('transactions.csv', toCsv(filtered, [{ label: 'Portfolio', value: (t) => names[t.portfolioId] }, ...TRANSACTION_COLUMNS]));

  return (
    <>
      <PageHeader title="Transactions" subtitle="Every buy, sell, dividend and cash movement. Positions and gains are calculated from this ledger.">
        <button type="button" className="btn btn-primary" onClick={() => setPanel(panel === 'add' ? null : 'add')} aria-expanded={panel === 'add'}>Add transaction</button>
        <button type="button" className="btn" onClick={() => setPanel(panel === 'import' ? null : 'import')} aria-expanded={panel === 'import'}>Import CSV</button>
        <button type="button" className="btn" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
      </PageHeader>
      {panel === 'add' && <AddForm onDone={() => setPanel(null)} />}
      {panel === 'import' && <ImportPanel onDone={() => setPanel(null)} />}

      <Tabs label="Transaction views" value={tab} onChange={(t) => { setTab(t); setF((x) => ({ ...x, type: t === 'all' ? 'all' : t })); setPage(1); }} tabs={[{ id: 'all', label: 'All' }, { id: 'buy', label: 'Buys' }, { id: 'sell', label: 'Sells' }, { id: 'dividend', label: 'Dividends' }, { id: 'deposit', label: 'Deposits' }, { id: 'withdraw', label: 'Withdrawals' }]} />
      <TabPanel id={tab} value={tab}>
        <section className="card flush" aria-label="Transaction list">
          <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
            <div className="field grow"><label htmlFor="t-q">Search notes</label><input id="t-q" type="search" value={f.q} onChange={set('q')} placeholder="Text in note, symbol or type" /></div>
            <div className="field"><label htmlFor="t-sym">Symbol</label><input id="t-sym" value={f.symbol} onChange={set('symbol')} placeholder="e.g. AAPL" /></div>
            <div className="field"><label htmlFor="t-from">From</label><input id="t-from" type="date" value={f.from} onChange={set('from')} /></div>
            <div className="field"><label htmlFor="t-to">To</label><input id="t-to" type="date" value={f.to} onChange={set('to')} /></div>
            <button type="button" className="btn" onClick={() => { setF({ type: tab === 'all' ? 'all' : tab, symbol: '', from: '', to: '', q: '' }); setPage(1); }} disabled={!(f.symbol || f.from || f.to || f.q)}>Clear filters</button>
          </form>
          {rows.length === 0 ? (
            <EmptyState title={filtersOn ? 'No transactions match' : 'No transactions yet'} action={<Link to="/stocks" className="btn btn-primary">Browse market</Link>}>
              {filtersOn ? 'Try widening the date range or clearing the filters.' : 'Place an order or add a transaction to start your ledger.'}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Transactions</caption>
                <thead>
                  <tr>
                    <th scope="col" aria-sort={dir === 'desc' ? 'descending' : 'ascending'}><button type="button" className="th-btn" onClick={() => setDir(dir === 'desc' ? 'asc' : 'desc')}>Date <span aria-hidden="true">{dir === 'desc' ? '▼' : '▲'}</span></button></th>
                    <th scope="col">Type</th>{scope === 'all' && <th scope="col" className="hide-sm">Portfolio</th>}<th scope="col">Stock</th>
                    <th scope="col" className="num hide-sm">Shares</th><th scope="col" className="num hide-sm">Price</th><th scope="col" className="num">Amount</th><th scope="col" className="hide-sm">Note</th><th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td>{dateOnly(t.date)}</td>
                      <td><span className={`badge ${t.type === 'buy' || t.type === 'deposit' ? 'badge-gain' : t.type === 'sell' || t.type === 'withdraw' ? 'badge-loss' : ''}`}>{TYPE_LABEL[t.type]}</span></td>
                      {scope === 'all' && <td className="hide-sm">{names[t.portfolioId]}</td>}
                      <td>{t.symbol ? <Link to={`/stocks/${t.symbol}`}>{t.symbol}</Link> : '—'}</td>
                      <td className="num hide-sm">{t.shares ? number(t.shares) : '—'}</td>
                      <td className="num hide-sm">{t.price ? money(t.price) : '—'}</td>
                      <td className="num">{money(t.amount)}{t.fee ? <div className="muted small">fee {money(t.fee)}</div> : null}</td>
                      <td className="hide-sm muted small">{t.note}</td>
                      <td className="num"><button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => remove(t)} aria-label={`Delete ${TYPE_LABEL[t.type]} ${t.symbol || ''} ${dateOnly(t.date)}`}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="pager" aria-label="Pagination">
            <button type="button" className="btn btn-sm" onClick={() => setPage(cur - 1)} disabled={cur <= 1}>Previous</button>
            <span aria-live="polite">Page {cur} of {pages} · {filtered.length} transactions · net cash {money(net)}</span>
            <button type="button" className="btn btn-sm" onClick={() => setPage(cur + 1)} disabled={cur >= pages}>Next</button>
          </nav>
        </section>
      </TabPanel>
    </>
  );
}
