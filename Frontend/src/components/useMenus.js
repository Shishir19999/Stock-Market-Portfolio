import { useEffect } from 'react';

/**
 * Makes horizontally scrollable tables keyboard-reachable: any .table-wrap that overflows becomes a focusable,
 * labelled region (and goes back to normal when it fits).
 */
export function useScrollRegions(rootId = 'main') {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => queue());
    const fix = () => {
      raf = 0;
      root.querySelectorAll('.table-wrap').forEach((el) => {
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        if (el.scrollWidth > el.clientWidth + 1) {
          el.tabIndex = 0;
          el.setAttribute('role', 'region');
          el.setAttribute('aria-label', `${el.querySelector('caption')?.textContent || 'Table'} (scrollable)`);
        } else {
          el.removeAttribute('tabindex');
          el.removeAttribute('role');
          el.removeAttribute('aria-label');
        }
      });
    };
    function queue() {
      if (!raf) raf = requestAnimationFrame(fix);
    }
    const mo = new MutationObserver(queue);
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener('resize', queue);
    queue();
    return () => {
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener('resize', queue);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rootId]);
}

/** Closes open header menus (<details class="menu">) on outside click, Escape, or when focus leaves them. */
export function useDismissMenus() {
  useEffect(() => {
    const open = () => [...document.querySelectorAll('details.menu[open]')];
    const onClick = (e) => open().forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      open().forEach((d) => {
        d.removeAttribute('open');
        d.querySelector('summary')?.focus();
      });
    };
    const onFocusIn = (e) => open().forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);
}
