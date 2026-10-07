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

export function EmptyState({ icon = '◌', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="empty error-state" role="alert">
      <div className="empty-icon" aria-hidden="true">!</div>
      <h3>{title}</h3>
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
