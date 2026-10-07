import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmContext } from './contexts.js';

function ConfirmDialog({ options, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = options;
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-msg"
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(false);
      }}
    >
      <div className="dialog-body">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-msg">{message}</p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => onClose(false)} autoFocus>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onClose(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setState({ options, resolve });
      }),
    [],
  );
  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };
  const value = useMemo(() => ({ confirm }), [confirm]);
  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state && <ConfirmDialog options={state.options} onClose={close} />}
    </ConfirmContext.Provider>
  );
}
