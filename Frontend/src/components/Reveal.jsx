import { useEffect, useRef, useState } from 'react';
import { useMotion } from '../context/hooks.js';

/**
 * Fade/slide-in when the element scrolls into view. Transform and opacity only.
 * Off under prefers-reduced-motion (content is simply visible); fade-only on small or low-power screens.
 */
const SUPPORTED = typeof window !== 'undefined' && 'IntersectionObserver' in window;

export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null);
  const motion = useMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (motion === 'off' || !el) return undefined;
    if (!SUPPORTED) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -4% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [motion]);

  const cls = motion === 'off' ? '' : `reveal reveal-${motion}${shown || !SUPPORTED ? ' is-in' : ''}`;
  return (
    <Tag ref={ref} className={`${className} ${cls}`.trim()} style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Decorative layer that drifts slower than the page while in view (transform only, rAF throttled).
 * Never rendered as moving under reduced motion or on small/low-power screens.
 */
export function Parallax({ speed = 0.18, className = '', children }) {
  const ref = useRef(null);
  const motion = useMotion();

  useEffect(() => {
    const el = ref.current;
    if (motion !== 'full' || !el) return undefined;
    let raf = 0;
    let visible = false;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const offset = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.transform = `translate3d(0, ${(-offset * speed).toFixed(1)}px, 0)`;
    };
    const request = () => {
      if (visible && !raf) raf = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      request();
    });
    io.observe(el.parentElement || el);
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = '';
    };
  }, [motion, speed]);

  return (
    <div ref={ref} className={`parallax ${className}`.trim()} aria-hidden="true" data-parallax={motion === 'full' ? 'on' : 'off'}>
      {children}
    </div>
  );
}
