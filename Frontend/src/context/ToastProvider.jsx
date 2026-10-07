import { useCallback, useMemo, useRef, useState } from 'react';
import { ToastContext } from './contexts.js';

const LIMIT = 4;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (message, type = 'info', ms = 4500) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((t) => [...t.slice(-(LIMIT - 1)), { id, message, type }]);
      if (ms > 0) setTimeout(() => dismiss(id), ms);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      show: push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error', 7000),
      info: (m) => push(m, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon" aria-hidden="true">
              {t.type === 'success' ? '✓' : t.type === 'error' ? '!' : 'i'}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button type="button" className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
