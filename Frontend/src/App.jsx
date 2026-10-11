import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import ThemeProvider from './context/ThemeProvider.jsx';
import ToastProvider from './context/ToastProvider.jsx';
import ConfirmProvider from './context/ConfirmProvider.jsx';
import AuthProvider from './context/AuthProvider.jsx';
import DataProvider from './context/DataProvider.jsx';
import { useAuth, useData } from './context/hooks.js';
import Layout from './components/Layout.jsx';
import { ErrorState, PageSkeleton } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Market from './pages/Market.jsx';
import StockDetail from './pages/StockDetail.jsx';
import Watchlists from './pages/Watchlists.jsx';
import Portfolios from './pages/Portfolios.jsx';
import Orders from './pages/Orders.jsx';
import Alerts from './pages/Alerts.jsx';
import Goals from './pages/Goals.jsx';
import Analytics from './pages/Analytics.jsx';
import Reports from './pages/Reports.jsx';
import Screener from './pages/Screener.jsx';
import Admin from './pages/Admin.jsx';
import Transactions from './pages/Transactions.jsx';
import Compare from './pages/Compare.jsx';
import NotFound from './pages/NotFound.jsx';
import { IS_DEMO } from './api/index.js';

// GitHub Pages cannot rewrite deep links, so the static live preview uses hash URLs (#/stocks/AAPL).
const Router = IS_DEMO ? HashRouter : BrowserRouter;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <DataProvider key={user.id}>
      <Gate />
    </DataProvider>
  );
}

// Shows skeletons while data loads and an error state with retry if it fails.
function Gate() {
  const { status, error, reload } = useData();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="*"
          element={
            status === 'loading' ? (
              <PageSkeleton />
            ) : status === 'error' ? (
              <ErrorState title="Could not load your data" message={error} onRetry={reload} />
            ) : (
              <Pages />
            )
          }
        />
      </Route>
    </Routes>
  );
}

function Pages() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/stocks" element={<Market />} />
      <Route path="/stocks/:symbol" element={<StockDetail />} />
      <Route path="/screener" element={<Screener />} />
      <Route path="/watchlists" element={<Watchlists />} />
      <Route path="/watchlist" element={<Navigate to="/watchlists" replace />} />
      <Route path="/portfolios" element={<Portfolios />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/alerts" element={<Alerts />} />
      <Route path="/goals" element={<Goals />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/transactions" element={<Transactions />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Router>
              <ScrollToTop />
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<Shell />} />
              </Routes>
            </Router>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
