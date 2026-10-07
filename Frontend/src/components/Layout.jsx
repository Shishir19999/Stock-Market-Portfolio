import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth, useConfirm, useData, useTheme, useToast } from '../context/hooks.js';
import { api, IS_DEMO } from '../api/index.js';

export function Logo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="28" height="28">
        <rect width="32" height="32" rx="8" fill="var(--primary)" />
        <path d="M6 22l7-8 5 5 8-10" fill="none" stroke="var(--on-primary)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="icon-btn theme-toggle" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}

export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="demo-banner" role="note">
      <strong>Demo mode</strong>
      <span>Sample data only. Everything you do is stored in this browser (localStorage) and never leaves your device.</span>
    </div>
  );
}

const NAV = [
  ['/dashboard', 'Dashboard'],
  ['/stocks', 'Market'],
  ['/watchlist', 'Watchlist'],
  ['/transactions', 'Transactions'],
  ['/compare', 'Compare'],
];

export default function Layout() {
  const { user, logout, authRequired } = useAuth();
  const { resetAccount } = useData();
  const { confirm } = useConfirm();
  const toast = useToast();

  const onReset = async () => {
    const ok = await confirm({
      title: IS_DEMO ? 'Reset demo data?' : 'Reset paper account?',
      message: IS_DEMO
        ? 'This restores the sample accounts, holdings, watchlists and alerts to their original state and signs you out.'
        : 'This clears your paper-trading cash, holdings, transactions and alerts stored in this browser. The server watchlist is not changed.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!ok) return;
    try {
      if (IS_DEMO) {
        await api.resetDemo();
        await logout();
      } else {
        await resetAccount();
      }
      toast.success(IS_DEMO ? 'Demo data restored.' : 'Paper account reset.');
    } catch (e) {
      toast.error(e.message || 'Reset failed.');
    }
  };

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <DemoBanner />
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/dashboard" className="brand">
            <Logo />
            <span className="brand-name">Stock Market Portfolio</span>
          </Link>
          <nav aria-label="Primary" className="nav">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-actions">
            <ThemeToggle />
            <details className="menu">
              <summary aria-label="Account menu">
                <span className="avatar" aria-hidden="true">{(user?.name || 'I').slice(0, 1).toUpperCase()}</span>
                <span className="menu-name">{user?.name || 'Investor'}</span>
              </summary>
              <div className="menu-pop">
                {user?.email && <div className="menu-email muted">{user.email}</div>}
                <button type="button" className="menu-item" onClick={onReset}>
                  {IS_DEMO ? 'Reset demo data' : 'Reset paper account'}
                </button>
                {authRequired && (
                  <button type="button" className="menu-item" onClick={logout}>Sign out</button>
                )}
              </div>
            </details>
          </div>
        </div>
      </header>
      <main id="main" className="container" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="footer">
        <span>Prices are illustrative sample data. Paper trading only, not financial advice.</span>
      </footer>
    </>
  );
}
