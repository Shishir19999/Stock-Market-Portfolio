import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth, useConfirm, useData, useTheme, useToast } from '../context/hooks.js';
import { api, IS_DEMO } from '../api/index.js';
import { dateTime } from '../lib/format.js';
import { useScrollRegions, useDismissMenus } from './useMenus.js';

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

export function PreviewBanner() {
  if (!IS_DEMO) return null;
  return (
    <section className="demo-banner" aria-label="Live preview notice">
      <strong>Live preview</strong>
      <span>Sample data and simulated prices. Everything you do is stored in this browser only and never leaves your device.</span>
    </section>
  );
}

const NAV = [
  ['Overview', [['/dashboard', 'Dashboard'], ['/analytics', 'Analytics'], ['/reports', 'Reports']]],
  ['Markets', [['/stocks', 'Market'], ['/screener', 'Screener'], ['/compare', 'Compare']]],
  ['Manage', [['/portfolios', 'Portfolios'], ['/transactions', 'Transactions'], ['/orders', 'Orders'], ['/watchlists', 'Watchlists'], ['/alerts', 'Alerts'], ['/goals', 'Goals']]],
];

function Notifications() {
  const { notifications, markNotificationsRead } = useData();
  const toast = useToast();
  const unread = notifications.filter((n) => !n.read).length;
  const markAll = async () => {
    try {
      await markNotificationsRead();
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <details className="menu">
      <summary aria-label={`Notifications, ${unread} unread`} className="bell">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="bell-count" aria-hidden="true">{unread}</span>}
      </summary>
      <div className="menu-pop notif-pop">
        <div className="row between notif-head">
          <strong>Notifications</strong>
          <button type="button" className="link-btn small" onClick={markAll} disabled={!unread}>Mark all read</button>
        </div>
        {notifications.length === 0 ? (
          <p className="muted small pad-sm">Nothing yet. Order fills and price alerts appear here.</p>
        ) : (
          <ul className="plain-list notif-list">
            {notifications.slice(0, 12).map((n) => (
              <li key={n.id} className={n.read ? '' : 'unread'}>
                <span>{n.text}</span>
                <span className="muted small">{dateTime(n.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const { resetAccount, portfolios, scope, setScope, quotes } = useData();
  const { confirm } = useConfirm();
  const toast = useToast();
  useScrollRegions();
  useDismissMenus();

  const onReset = async () => {
    const ok = await confirm({
      title: IS_DEMO ? 'Reset preview data?' : 'Reset my data?',
      message: IS_DEMO
        ? 'This restores the sample accounts, holdings, watchlists and alerts to their original state and signs you out.'
        : 'This deletes all of your portfolios, transactions, orders, watchlists, alerts and goals and starts again with a fresh portfolio.',
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
      toast.success(IS_DEMO ? 'Preview data restored.' : 'Your data was reset.');
    } catch (e) {
      toast.error(e.message || 'Reset failed.');
    }
  };

  const groups = isAdmin ? [...NAV, ['Administration', [['/admin', 'Admin console']]]] : NAV;
  const source = quotes.source === 'simulated' ? 'Simulated prices' : quotes.source === 'live' ? 'Live provider prices' : 'Mixed prices (provider + simulated)';

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <PreviewBanner />
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/dashboard" className="brand" aria-label="Stock Market Portfolio, dashboard">
            <Logo />
            <span className="brand-name">Stock Market Portfolio</span>
          </Link>
          <div className="topbar-actions">
            <label className="scope">
              <span className="sr-only">Portfolio</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Portfolio">
                <option value="all">All portfolios</option>
                {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <Notifications />
            <ThemeToggle />
            <details className="menu">
              <summary aria-label="Account menu">
                <span className="avatar" aria-hidden="true">{(user?.name || 'I').slice(0, 1).toUpperCase()}</span>
                <span className="menu-name">{user?.name || 'Investor'}</span>
              </summary>
              <div className="menu-pop">
                <div className="menu-email muted">{user?.email}</div>
                <div className="menu-email"><span className={`badge ${isAdmin ? 'badge-admin' : ''}`}>{isAdmin ? 'Admin' : 'User'}</span></div>
                <button type="button" className="menu-item" onClick={onReset}>{IS_DEMO ? 'Reset preview data' : 'Reset my data'}</button>
                <button type="button" className="menu-item" onClick={logout}>Sign out</button>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="shell">
        <nav aria-label="Primary" className="sidenav">
          {groups.map(([title, links]) => (
            <div className="nav-group" key={title}>
              <p className="nav-title">{title}</p>
              {links.map(([to, label]) => (
                <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
          <p className="nav-source small muted">{source}</p>
        </nav>
        <main id="main" className="container" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <footer className="footer">
        <span>Prices are simulated sample data unless a market data provider is configured. Paper trading only, not financial advice.</span>
      </footer>
    </>
  );
}
