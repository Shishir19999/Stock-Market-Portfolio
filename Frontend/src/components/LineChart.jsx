import { useEffect, useMemo, useRef, useState } from 'react';

const H = 280;
const PAD = { l: 52, r: 14, t: 12, b: 26 };

function niceTicks(min, max, count = 4) {
  if (min === max) return [min];
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

const fmtDate = (t, span) => {
  const d = new Date(t);
  return span < 400 * 86400000
    ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    : span < 1200 * 86400000
      ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      : String(d.getUTCFullYear());
};

/**
 * series: [{ name, color, points: [{t, price}] }]. Hover, touch or arrow keys move a crosshair.
 */
export default function LineChart({ series, valueFormat = (v) => v.toFixed(2), label, live = false }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [idx, setIdx] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    setWidth(Math.max(240, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (all.length < 2) return null;
    const t0 = Math.min(...all.map((p) => p.t));
    const t1 = Math.max(...all.map((p) => p.t));
    let lo = Math.min(...all.map((p) => p.price));
    let hi = Math.max(...all.map((p) => p.price));
    const padY = (hi - lo || hi * 0.02 || 1) * 0.08;
    lo = Math.max(0, lo - padY);
    hi += padY;
    const x = (t) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (width - PAD.l - PAD.r);
    const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
    return { t0, t1, lo, hi, x, y };
  }, [series, width]);

  if (!geo) {
    return (
      <div className="chart-empty" role="status">
        {live ? 'Collecting live prices… the chart appears after a few ticks.' : 'Not enough data to draw a chart.'}
      </div>
    );
  }
  const { t0, t1, lo, hi, x, y } = geo;
  const main = series[0].points;
  const n = main.length;
  const clamp = (i) => Math.min(n - 1, Math.max(0, i));
  const active = idx === null ? null : clamp(idx);
  const activeT = active === null ? null : main[active].t;

  const valueAt = (s, t) => {
    let best = s.points[0];
    for (const p of s.points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    return best;
  };

  const onMove = (clientX, rect) => {
    const t = t0 + ((clientX - rect.left - PAD.l) / (width - PAD.l - PAD.r)) * (t1 - t0);
    let best = 0;
    for (let i = 0; i < n; i += 1) if (Math.abs(main[i].t - t) < Math.abs(main[best].t - t)) best = i;
    setIdx(best);
  };

  const onKey = (e) => {
    const step = e.shiftKey ? 12 : 1;
    if (e.key === 'ArrowLeft') setIdx(clamp((active ?? n - 1) - step));
    else if (e.key === 'ArrowRight') setIdx(clamp((active ?? n - 1) + step));
    else if (e.key === 'Home') setIdx(0);
    else if (e.key === 'End') setIdx(n - 1);
    else if (e.key === 'Escape') setIdx(null);
    else return;
    e.preventDefault();
  };

  const yTicks = niceTicks(lo, hi);
  const xTickCount = Math.max(2, Math.floor(width / 110));
  const xTicks = Array.from({ length: xTickCount }, (_, i) => t0 + ((t1 - t0) * i) / (xTickCount - 1));
  const single = series.length === 1;
  const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`).join('');
  const readout =
    active === null
      ? ''
      : `${new Date(activeT).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: live ? undefined : 'UTC' })}: ${series
          .map((s) => `${s.name} ${valueFormat(valueAt(s, activeT).price)}`)
          .join(', ')}`;
  const tipX = active === null ? 0 : x(activeT);
  const tipLeft = tipX > width * 0.6;

  return (
    <div className="chart" ref={wrapRef}>
      <svg
        width={width}
        height={H}
        role="group"
        tabIndex={0}
        aria-label={`${label}. Use left and right arrow keys to inspect values.`}
        onKeyDown={onKey}
        onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setIdx(null)}
        onBlur={() => setIdx(null)}
        style={{ touchAction: 'pan-y' }}
      >
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--c1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} className="grid-line" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="axis">{valueFormat(v)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} className="axis">
            {fmtDate(t, t1 - t0)}
          </text>
        ))}
        {single && (
          <path d={`${pathOf(main)}L${x(main[n - 1].t)},${H - PAD.b}L${x(main[0].t)},${H - PAD.b}Z`} fill="url(#area-fill)" />
        )}
        {series.map((s) => (
          <path key={s.name} d={pathOf(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {active !== null && (
          <g>
            <line x1={tipX} x2={tipX} y1={PAD.t} y2={H - PAD.b} className="crosshair" />
            {series.map((s) => {
              const p = valueAt(s, activeT);
              return <circle key={s.name} cx={x(p.t)} cy={y(p.price)} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />;
            })}
          </g>
        )}
      </svg>
      {active !== null && (
        <div className="tooltip" style={{ left: tipLeft ? undefined : tipX + 10, right: tipLeft ? width - tipX + 10 : undefined }} aria-hidden="true">
          <strong>{new Date(activeT).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: live ? 'numeric' : undefined, timeZone: live ? undefined : 'UTC' })}</strong>
          {series.map((s) => (
            <div key={s.name}>
              <span className="swatch" style={{ background: s.color }} /> {s.name}: {valueFormat(valueAt(s, activeT).price)}
            </div>
          ))}
        </div>
      )}
      <span className="sr-only" aria-live="polite">{readout}</span>
    </div>
  );
}
