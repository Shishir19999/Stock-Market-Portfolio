import { useContext, useEffect, useState } from 'react';
import { ThemeContext, ToastContext, ConfirmContext, AuthContext, DataContext } from './contexts.js';

const need = (ctx, name) => {
  if (!ctx) throw new Error(`${name} must be used inside its provider`);
  return ctx;
};
export const useTheme = () => need(useContext(ThemeContext), 'useTheme');
export const useToast = () => need(useContext(ToastContext), 'useToast');
export const useConfirm = () => need(useContext(ConfirmContext), 'useConfirm');
export const useAuth = () => need(useContext(AuthContext), 'useAuth');
export const useData = () => need(useContext(DataContext), 'useData');

/** Sets the document title for the current page. */
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Stock Market Portfolio` : 'Stock Market Portfolio';
  }, [title]);
}

const mq = (q) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

/**
 * Motion level for decorative animation:
 *  'off'  - user prefers reduced motion
 *  'lite' - small screen or low-power device: fades only, no parallax
 *  'full' - everything allowed
 */
function computeMotion() {
  const reduce = mq('(prefers-reduced-motion: reduce)');
  if (reduce?.matches) return 'off';
  const small = mq('(max-width: 720px)');
  const lowPower = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
  if (small?.matches || lowPower || navigator.connection?.saveData) return 'lite';
  return 'full';
}

export function useMotion() {
  const [mode, setMode] = useState(computeMotion);
  useEffect(() => {
    const queries = [mq('(prefers-reduced-motion: reduce)'), mq('(max-width: 720px)')].filter(Boolean);
    const on = () => setMode(computeMotion());
    queries.forEach((q) => q.addEventListener('change', on));
    return () => queries.forEach((q) => q.removeEventListener('change', on));
  }, []);
  return mode;
}
