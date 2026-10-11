import { useCallback, useEffect, useId, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, IS_DEMO } from '../api/index.js';
import { useAuth, useConfirm, useData, useTitle, useToast } from '../context/hooks.js';
import { ErrorState, Field, PageHeader, Stat, Tabs, TabPanel } from '../components/ui.jsx';
import { dateTime, money } from '../lib/format.js';

function useAsync(fn) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const run = useCallback(async () => {
    try {
      setState((s) => ({ ...s, loading: true, error: '' }));
      setState({ loading: false, error: '', data: await fn() });
    } catch (e) {
      setState({ loading: false, error: e.message, data: null });
    }
  }, [fn]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run();
  }, [run]);
  return [state, run];
}

function Overview() {
  const [s] = useAsync(api.admin.stats);
  if (s.error) return <ErrorState message={s.error} />;
  if (!s.data) return <p role="status">Loading…</p>;
  const d = s.data;
  return (
    <div className="grid kpis">
      <Stat label="Users" value={d.users}><span className="muted small">{d.admins} admin{d.admins === 1 ? '' : 's'}</span></Stat>
      <Stat label="Portfolios" value={d.portfolios} />
      <Stat label="Transactions" value={d.transactions}><span className="muted small">{d.openOrders} open orders</span></Stat>
      <Stat label="Stocks tracked" value={d.stocks}><span className="muted small">{d.market?.configured ? 'Provider key configured' : 'Simulated prices'}</span></Stat>
    </div>
  );
}

function Users() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [s, reload] = useAsync(api.admin.users);
  const act = async (fn, ok) => {
    try {
      await fn();
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const del = async (u) => {
    if (await confirm({ title: `Delete ${u.email}?`, message: 'The account and all of its portfolios and transactions are removed permanently.', confirmLabel: 'Delete user', danger: true })) act(() => api.admin.deleteUser(u.id), 'User deleted.');
  };
  if (s.error) return <ErrorState message={s.error} onRetry={reload} />;
  if (!s.data) return <p role="status">Loading…</p>;
  return (
    <section className="card flush" aria-label="Users">
      <div className="table-wrap">
        <table>
          <caption className="sr-only">User accounts</caption>
          <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col" className="hide-sm">Last sign-in</th><th scope="col" className="num hide-sm">Transactions</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {s.data.map((u) => {
              const self = u.id === user.id;
              return (
                <tr key={u.id}>
                  <th scope="row">{u.name}{self && <span className="badge"> you</span>}<div className="muted small">{u.email}</div></th>
                  <td><span className={`badge ${u.role === 'admin' ? 'badge-admin' : ''}`}>{u.role === 'admin' ? 'Admin' : 'User'}</span></td>
                  <td><span className={`badge ${u.active ? 'badge-gain' : 'badge-loss'}`}>{u.active ? 'Active' : 'Deactivated'}</span></td>
                  <td className="hide-sm">{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'}</td>
                  <td className="num hide-sm">{u.transactions}</td>
                  <td className="num">
                    <div className="row wrap end">
                      <button type="button" className="btn btn-sm" disabled={self} onClick={() => act(() => api.admin.updateUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }), 'Role updated.')} aria-label={`${u.role === 'admin' ? 'Make user' : 'Make admin'}: ${u.email}`}>{u.role === 'admin' ? 'Make user' : 'Make admin'}</button>
                      <button type="button" className="btn btn-sm" disabled={self} onClick={() => act(() => api.admin.updateUser(u.id, { active: !u.active }), u.active ? 'User deactivated.' : 'User activated.')} aria-label={`${u.active ? 'Deactivate' : 'Activate'} ${u.email}`}>{u.active ? 'Deactivate' : 'Activate'}</button>
                      <button type="button" className="btn btn-sm btn-danger-ghost" disabled={self} onClick={() => del(u)} aria-label={`Delete ${u.email}`}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Settings() {
  const toast = useToast();
  const uid = useId();
  const { refresh } = useData();
  const [s] = useAsync(api.admin.settings);
  const [f, setF] = useState(null);
  const [err, setErr] = useState({ message: '', field: '' });
  const form = f || s.data?.settings;
  if (s.error) return <ErrorState message={s.error} />;
  if (!form) return <p role="status">Loading…</p>;
  const market = s.data.market;
  const set = (k, v) => { setF({ ...form, [k]: v }); setErr({ message: '', field: '' }); };
  const fe = (k) => (err.field === k ? err.message : undefined);
  const save = async (e) => {
    e.preventDefault();
    try {
      const res = await api.admin.saveSettings({ ...form, startingCash: form.startingCash, commission: form.commission, refreshSeconds: Number(form.refreshSeconds) });
      setF(res.settings);
      await refresh();
      toast.success('Settings saved.');
    } catch (ex) {
      setErr({ message: ex.message, field: ex.field || '' });
    }
  };
  return (
    <div className="grid two">
      <form className="card stack-sm" onSubmit={save} noValidate aria-labelledby={`${uid}-h`}>
        <h2 id={`${uid}-h`}>Platform settings</h2>
        <Field id={`${uid}-src`} label="Market data source" hint="Auto uses a provider when its key is configured on the server, and falls back to simulated prices.">
          <select id={`${uid}-src`} value={form.marketSource} onChange={(e) => set('marketSource', e.target.value)} aria-describedby={`${uid}-src-hint`}>
            <option value="auto">Auto (provider if configured)</option><option value="simulated">Always simulated</option>
          </select>
        </Field>
        <Field id={`${uid}-ref`} label="Price refresh interval (seconds)" error={fe('refreshSeconds')} hint="How often open apps fetch prices and check orders and alerts (3 to 300).">
          <input id={`${uid}-ref`} type="number" min="3" max="300" step="1" value={form.refreshSeconds} onChange={(e) => set('refreshSeconds', e.target.value)} />
        </Field>
        <Field id={`${uid}-com`} label="Commission per trade ($)" error={fe('commission')} hint="Charged on every simulated fill.">
          <input id={`${uid}-com`} type="number" min="0" step="0.01" value={form.commission} onChange={(e) => set('commission', e.target.value)} />
        </Field>
        <Field id={`${uid}-cash`} label="Starting cash for new accounts ($)" error={fe('startingCash')}>
          <input id={`${uid}-cash`} type="number" min="0" step="1" value={form.startingCash} onChange={(e) => set('startingCash', e.target.value)} />
        </Field>
        <label className="check"><input type="checkbox" checked={form.allowSignups} onChange={(e) => set('allowSignups', e.target.checked)} /> Allow new sign-ups</label>
        {err.message && !err.field && <div className="form-error" role="alert">{err.message}</div>}
        <div><button type="submit" className="btn btn-primary">Save settings</button></div>
      </form>
      <section className="card stack-sm" aria-labelledby={`${uid}-m`}>
        <h2 id={`${uid}-m`}>Market data provider</h2>
        <dl className="kv">
          <div><dt>Mode</dt><dd>{IS_DEMO ? 'Live preview (simulated)' : market.configured ? 'Provider key set' : 'Simulated (no key)'}</dd></div>
          <div><dt>Provider</dt><dd>{market.provider || 'None'}</dd></div>
          <div><dt>Cached quotes</dt><dd>{market.cached ?? 0}</dd></div>
          <div><dt>Last provider error</dt><dd>{market.lastError || 'None'}</dd></div>
          <div><dt>Example commission cost</dt><dd>{money(Number(form.commission) || 0)} per fill</dd></div>
        </dl>
        <p className="muted small">
          {IS_DEMO
            ? 'The live preview always uses deterministic simulated prices that tick, so no keys are needed.'
            : 'To use a free provider, set MARKET_API_KEY in the backend environment (never in the frontend). Without it, or if the provider fails for a symbol, deterministic simulated prices are used.'}
        </p>
      </section>
    </div>
  );
}

function Audit() {
  const [s, reload] = useAsync(api.admin.audit);
  const [q, setQ] = useState('');
  if (s.error) return <ErrorState message={s.error} onRetry={reload} />;
  if (!s.data) return <p role="status">Loading…</p>;
  const rows = s.data.filter((a) => !q.trim() || `${a.actorName} ${a.action} ${a.target} ${a.detail}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="card flush" aria-label="Audit log">
      <div className="filters">
        <div className="field grow"><label htmlFor="audit-q">Filter the log</label><input id="audit-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Actor, action, target or detail" /></div>
        <button type="button" className="btn" onClick={reload}>Refresh</button>
      </div>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Audit log, newest first</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col" className="hide-sm">Target</th><th scope="col" className="hide-sm">Detail</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="muted center">No entries.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id}><td>{dateTime(a.at)}</td><td>{a.actorName}</td><td><code>{a.action}</code></td><td className="hide-sm">{a.target}</td><td className="hide-sm muted small">{a.detail}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Admin() {
  useTitle('Admin console');
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('overview');
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return (
    <>
      <PageHeader title="Admin console" subtitle="Manage users, market data settings and review the audit log." />
      <Tabs label="Admin sections" value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'users', label: 'Users' }, { id: 'settings', label: 'Market data and settings' }, { id: 'audit', label: 'Audit log' }]} />
      <TabPanel id="overview" value={tab}><Overview /></TabPanel>
      <TabPanel id="users" value={tab}><Users /></TabPanel>
      <TabPanel id="settings" value={tab}><Settings /></TabPanel>
      <TabPanel id="audit" value={tab}><Audit /></TabPanel>
    </>
  );
}
