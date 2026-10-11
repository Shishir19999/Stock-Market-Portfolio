import { tone, pct, signedMoney } from '../lib/format.js';

export function Skeleton({ w = '100%', h = 16, r = 6, className = '' }) {
  return <span className={`skeleton ${className}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

/** Loading placeholder for a whole page section; announces itself to assistive tech. */
export function PageSkeleton({ rows = 6, label = 'Loading' }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="stack">
      <span className="sr-only">{label}…</span>
      <div className="grid kpis">
        {[0, 1, 2, 3].map((i) => (
          <div className="card" key={i}>
            <Skeleton w="50%" h={12} />
            <div style={{ height: 10 }} />
            <Skeleton w="75%" h={26} />
          </div>
        ))}
      </div>
      <div className="card">
        {Array.from({ length: rows }, (_, i) => (
          <div className="skeleton-row" key={i}>
            <Skeleton w="22%" />
            <Skeleton w="38%" />
            <Skeleton w="14%" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon = '◌', title, children, action, level = 0 }) {
  const Title = level ? `h${level}` : 'p';
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <Title className="empty-title">{title}</Title>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="empty error-state" role="alert">
      <div className="empty-icon" aria-hidden="true">!</div>
      <p className="empty-title">{title}</p>
      {message && <p>{message}</p>}
      {onRetry && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Gain/loss text that never relies on colour alone (arrow + sign). */
export function Change({ value, kind = 'pct', digits = 2 }) {
  const t = tone(value);
  const arrow = t === 'gain' ? '▲' : t === 'loss' ? '▼' : '–';
  return (
    <span className={`change ${t}`}>
      <span aria-hidden="true">{arrow}</span> {kind === 'money' ? signedMoney(value) : pct(value, digits)}
    </span>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Field({ id, label, error, hint, children }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && (
        <span className="field-error" id={`${id}-err`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Progress({ value, label, tone: t = 'primary' }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span className={`progress-fill ${t}`} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Accessible tab list: arrow keys move between tabs. */
export function Tabs({ tabs, value, onChange, label }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={value === t.id} aria-controls={`panel-${t.id}`} tabIndex={value === t.id ? 0 : -1} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const TabPanel = ({ id, value, children }) => (
  <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={value !== id} className="stack">
    {value === id ? children : null}
  </div>
);

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([k, text]) => (
        <button key={k} type="button" className={value === k ? 'on' : ''} aria-pressed={value === k} onClick={() => onChange(k)}>{text}</button>
      ))}
    </div>
  );
}

export function Stat({ label, value, children }) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {children}
    </div>
  );
}

/** Symbol picker backed by the catalogue. */
export function StockSelect({ id, value, onChange, stocks, label = 'Stock', allowEmpty = false }) {
  return (
    <Field id={id} label={label}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value="">Choose a stock</option>}
        {stocks.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} · {s.company}</option>)}
      </select>
    </Field>
  );
}

/** Sortable column header button. */
export function SortTh({ children, sortKey, s, className = '' }) {
  const on = s.sort.key === sortKey;
  return (
    <th scope="col" className={className} aria-sort={s.aria(sortKey)}>
      <button type="button" className="th-btn" onClick={() => s.toggle(sortKey)}>
        {children}
        <span aria-hidden="true">{on ? (s.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  );
}
