import { useId, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useTitle } from '../context/hooks.js';
import { Field } from '../components/ui.jsx';
import { Reveal, Parallax } from '../components/Reveal.jsx';
import { Logo, ThemeToggle, PreviewBanner } from '../components/Layout.jsx';
import { DEMO_LOGINS } from '../api/demo.js';
import { EMAIL_RE, PASSWORD_MIN } from '@shared/validate.js';
import { IS_DEMO } from '../api/index.js';

const FEATURES = [
  ['Portfolio dashboard', 'Value, daily and total gain, allocation by holding, sector or asset, and performance against a benchmark.'],
  ['Multiple portfolios', 'Separate portfolios with their own cash and FIFO or average cost basis, plus CSV import and export.'],
  ['Realized and unrealized P&L', 'Tax-lot report, dividends, fees and a printable report built from your transaction ledger.'],
  ['Pro charts', 'Candlestick and line charts with SMA, EMA and RSI, keyboard-friendly with data tables.'],
  ['Paper trading', 'Market, limit and stop orders that fill automatically as simulated prices move.'],
  ['Risk and goals', 'Volatility, drawdown, Sharpe and beta, savings goals, targets and rebalancing suggestions.'],
  ['Screener and compare', 'Filter the market by momentum and volatility, and compare up to four stocks side by side.'],
  ['Alerts and watchlists', 'Several watchlists and price alerts with in-app notifications.'],
];

export default function Login() {
  useTitle('Sign in');
  const { user, login, signup } = useAuth();
  const uid = useId();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: '' }));
  };

  const validate = () => {
    const e = {};
    if (mode === 'signup' && form.name.trim().length < 2) e.name = 'Enter your name (at least 2 characters).';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (!form.password) e.password = 'Enter your password.';
    else if (mode === 'signup' && form.password.length < PASSWORD_MIN) e.password = `Use at least ${PASSWORD_MIN} characters.`;
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await signup(form.name, form.email, form.password);
    } catch (err) {
      setFormError(err.message || 'Could not sign in.');
      setBusy(false);
    }
  };

  const fill = (d) => {
    setMode('login');
    setForm({ name: '', email: d.email, password: d.password });
    setErrors({});
    setFormError('');
  };

  return (
    <div className="auth-page">
      <header className="auth-top">
        <span className="brand"><Logo /><span className="brand-name">Stock Market Portfolio</span></span>
        <ThemeToggle />
      </header>
      <PreviewBanner />
      <main id="main">
      <section className="hero">
        <Parallax speed={0.22} className="blob blob-a"><span /></Parallax>
        <Parallax speed={0.1} className="blob blob-b"><span /></Parallax>
        <div className="hero-grid">
          <Reveal className="hero-copy">
            <p className="eyebrow">Portfolio and trading tracker</p>
            <h1>Build a portfolio. Track it. Learn without risk.</h1>
            <p className="lead">
              Track portfolios, analyse risk and performance, and paper-trade with virtual cash across 60 well-known companies while a simulated market moves in real time.
            </p>
          </Reveal>
          <Reveal className="card auth-card" delay={120}>
            <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
            <form onSubmit={submit} noValidate className="stack-sm">
              {mode === 'signup' && (
                <Field id={`${uid}-name`} label="Name" error={errors.name}>
                  <input id={`${uid}-name`} autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={errors.name ? 'true' : undefined} aria-describedby={errors.name ? `${uid}-name-err` : undefined} />
                </Field>
              )}
              <Field id={`${uid}-email`} label="Email" error={errors.email}>
                <input id={`${uid}-email`} type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set('email')} aria-invalid={errors.email ? 'true' : undefined} aria-describedby={errors.email ? `${uid}-email-err` : undefined} />
              </Field>
              <Field id={`${uid}-pw`} label="Password" error={errors.password}>
                <input id={`${uid}-pw`} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} aria-invalid={errors.password ? 'true' : undefined} aria-describedby={errors.password ? `${uid}-pw-err` : undefined} />
              </Field>
              {formError && <div className="form-error" role="alert">{formError}</div>}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>
            <p className="small center">
              {mode === 'login' ? 'New here? ' : 'Already registered? '}
              <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErrors({}); setFormError(''); }}>
                {mode === 'login' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
            {IS_DEMO && (
            <div className="demo-logins">
              <h3>Sample logins</h3>
              <ul className="plain-list">
                {DEMO_LOGINS.map((d) => (
                  <li key={d.email}>
                    <div>
                      <code>{d.email}</code> / <code>{d.password}</code>
                      <div className="muted small">{d.note}</div>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => fill(d)}>Use</button>
                  </li>
                ))}
              </ul>
            </div>
            )}
            {!IS_DEMO && <p className="muted small center">The first account created becomes the administrator.</p>}
          </Reveal>
        </div>
      </section>
      <section className="features" aria-labelledby="features-h">
        <h2 id="features-h">Everything a portfolio tracker needs</h2>
        <div className="grid feature-grid">
          {FEATURES.map(([t, d], i) => (
            <Reveal key={t} className="card feature" delay={i * 70}>
              <h3>{t}</h3>
              <p className="muted">{d}</p>
            </Reveal>
          ))}
        </div>
      </section>
      </main>
      <footer className="footer"><span>Prices are simulated sample data. Paper trading only, not financial advice.</span></footer>
    </div>
  );
}
