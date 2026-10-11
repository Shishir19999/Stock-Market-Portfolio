import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm, useData, useTitle, useToast } from '../context/hooks.js';
import { Change, EmptyState, Field, PageHeader, StockSelect } from '../components/ui.jsx';
import { money } from '../lib/format.js';

export default function Watchlists() {
  useTitle('Watchlists');
  const { watchlists, stocks, bySymbol, createWatchlist, updateWatchlist, deleteWatchlist } = useData();
  const { confirm } = useConfirm();
  const toast = useToast();
  const uid = useId();
  const [sel, setSel] = useState(watchlists[0]?.id);
  const [newName, setNewName] = useState('');
  const [rename, setRename] = useState(null);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');

  const list = watchlists.find((w) => w.id === sel) || watchlists[0];
  const options = stocks.filter((s) => !list?.symbols.includes(s.symbol));
  const choice = pick && options.some((s) => s.symbol === pick) ? pick : options[0]?.symbol || '';
  const guard = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  };

  const create = (e) => {
    e.preventDefault();
    guard(async () => {
      const w = await createWatchlist({ name: newName, symbols: [] });
      setSel(w.id);
      setNewName('');
    }, 'Watchlist created.');
  };
  const remove = async () => {
    const ok = await confirm({ title: `Delete "${list.name}"?`, message: 'The list is removed. The stocks themselves are not affected.', confirmLabel: 'Delete', danger: true });
    if (ok) guard(async () => { await deleteWatchlist(list.id); setSel(undefined); }, 'Watchlist deleted.');
  };

  return (
    <>
      <PageHeader title="Watchlists" subtitle="Group the stocks you follow. Add stocks here or with the star on the market page." />
      <div className="grid wl-grid">
        <section className="card stack-sm" aria-labelledby={`${uid}-lists`}>
          <h2 id={`${uid}-lists`}>Your lists</h2>
          {watchlists.length === 0 ? <p className="muted">No lists yet.</p> : (
            <ul className="plain-list nav-list">
              {watchlists.map((w) => (
                <li key={w.id}><button type="button" className={`list-btn${list?.id === w.id ? ' on' : ''}`} aria-current={list?.id === w.id ? 'true' : undefined} onClick={() => setSel(w.id)}>{w.name} <span className="muted small">({w.symbols.length})</span></button></li>
              ))}
            </ul>
          )}
          <form onSubmit={create} className="stack-sm" noValidate>
            <Field id={`${uid}-new`} label="New list name"><input id={`${uid}-new`} value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} /></Field>
            <button type="submit" className="btn" disabled={!newName.trim()}>Create list</button>
          </form>
        </section>

        <section className="card stack-sm" aria-labelledby={`${uid}-cur`}>
          {!list ? <EmptyState title="Create your first watchlist">Name a list on the left to get started.</EmptyState> : (
            <>
              <div className="row between wrap">
                {rename === null ? <h2 id={`${uid}-cur`}>{list.name}</h2> : (
                  <form className="row" onSubmit={(e) => { e.preventDefault(); guard(async () => { await updateWatchlist(list.id, { name: rename }); setRename(null); }, 'Renamed.'); }}>
                    <label className="sr-only" htmlFor={`${uid}-rn`}>List name</label>
                    <input id={`${uid}-rn`} value={rename} maxLength={40} onChange={(e) => setRename(e.target.value)} autoFocus />
                    <button type="submit" className="btn btn-sm btn-primary">Save</button>
                    <button type="button" className="btn btn-sm" onClick={() => setRename(null)}>Cancel</button>
                  </form>
                )}
                <div className="row">
                  <button type="button" className="btn btn-sm" onClick={() => setRename(list.name)}>Rename</button>
                  <button type="button" className="btn btn-sm btn-danger-ghost" onClick={remove}>Delete list</button>
                </div>
              </div>
              <div className="row wrap pick-row">
                <StockSelect id={`${uid}-add`} label="Add a stock" value={choice} onChange={setPick} stocks={options} />
                <button type="button" className="btn btn-primary" disabled={!choice} onClick={() => guard(async () => { await updateWatchlist(list.id, { symbols: [...list.symbols, choice] }); setPick(''); }, `${choice} added.`)}>Add</button>
              </div>
              {err && <div className="form-error" role="alert">{err}</div>}
              {list.symbols.length === 0 ? <EmptyState title="This list is empty">Add a stock above.</EmptyState> : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">{list.name}</caption>
                    <thead><tr><th scope="col">Stock</th><th scope="col" className="num">Price</th><th scope="col" className="num">Today</th><th scope="col" className="num hide-sm">Since 2007</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
                    <tbody>
                      {list.symbols.map((sym) => {
                        const s = bySymbol[sym];
                        return s && (
                          <tr key={sym}>
                            <th scope="row"><Link to={`/stocks/${sym}`}><strong>{sym}</strong></Link> <span className="muted small hide-sm">{s.company}</span></th>
                            <td className="num">{money(s.price)}</td>
                            <td className="num"><Change value={s.changePct} /></td>
                            <td className="num hide-sm"><Change value={s.growth} digits={0} /></td>
                            <td className="num"><button type="button" className="btn btn-sm btn-danger-ghost" aria-label={`Remove ${sym} from ${list.name}`} onClick={() => guard(() => updateWatchlist(list.id, { symbols: list.symbols.filter((x) => x !== sym) }), `${sym} removed.`)}>Remove</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
