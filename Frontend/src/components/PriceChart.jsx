import { useEffect, useMemo, useRef, useState } from 'react';
import { rsi } from '@shared/analytics.js';
import { INDICATORS } from './indicators.js';
import { money, number } from '../lib/format.js';

const PAD = { l: 56, r: 14, t: 10, b: 24 };
const MAIN_H = 300;
const VOL_H = 56;
const RSI_H = 96;
const DAY = 86400000;


function niceTicks(min, max, count = 5) {
  if (min === max) return [min];
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

const fmtDate = (t, long) =>
  new Date(t).toLocaleDateString('en-US', long ? { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' });

/**
 * Candlestick or line price chart with optional SMA/EMA overlays, volume and an RSI panel.
 * candles: [{ t, o, h, l, c, v }] oldest first; days: visible window in calendar days (0 = all).
 * Indicators are computed on the full series so the visible window has no warm-up gap.
 */
export default function PriceChart({ candles, days = 0, mode = 'candle', overlays = [], showRsi = false, label }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [idx, setIdx] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    setWidth(Math.max(260, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const calc = useMemo(() => {
    const closes = candles.map((c) => c.c);
    const lines = Object.fromEntries(overlays.map((k) => [k, INDICATORS[k].calc(closes)]));
    return { lines, rsi: rsi(closes, 14) };
  }, [candles, overlays]);

  const start = useMemo(() => {
    if (!days || !candles.length) return 0;
    const cut = candles[candles.length - 1].t - days * DAY;
    const i = candles.findIndex((c) => c.t >= cut);
    return Math.min(Math.max(0, i), Math.max(0, candles.length - 2));
  }, [candles, days]);
  const view = candles.slice(start);
  const n = view.length;

  if (n < 2) return <div className="chart-empty" role="status">Not enough data to draw a chart.</div>;

  const plotW = width - PAD.l - PAD.r;
  const x = (i) => PAD.l + ((i + 0.5) / n) * plotW;
  const lines = overlays.map((k) => ({ key: k, vals: calc.lines[k].slice(start) }));
  const allVals = [...view.flatMap((c) => (mode === 'candle' ? [c.h, c.l] : [c.c])), ...lines.flatMap((l) => l.vals.filter((v) => v !== null))];
  let lo = Math.min(...allVals);
  let hi = Math.max(...allVals);
  const padY = (hi - lo || hi * 0.02 || 1) * 0.06;
  lo = Math.max(0, lo - padY);
  hi += padY;
  const priceBottom = MAIN_H - PAD.b - VOL_H - 6;
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (priceBottom - PAD.t);
  const maxVol = Math.max(...view.map((c) => c.v)) || 1;
  const vy = (v) => MAIN_H - PAD.b - (v / maxVol) * VOL_H;
  const rsiVals = calc.rsi.slice(start);
  const ry = (v) => 8 + (1 - v / 100) * (RSI_H - 24);
  const totalH = MAIN_H + (showRsi ? RSI_H : 0);
  const cw = Math.max(1, Math.min(14, (plotW / n) * 0.62));
  const active = idx === null ? null : Math.min(n - 1, Math.max(0, idx));
  const cur = active === null ? null : view[active];

  const onMove = (clientX, rect) => setIdx(Math.round(((clientX - rect.left - PAD.l) / plotW) * n - 0.5));
  const onKey = (e) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') setIdx(Math.max(0, (active ?? n - 1) - step));
    else if (e.key === 'ArrowRight') setIdx(Math.min(n - 1, (active ?? n - 1) + step));
    else if (e.key === 'Home') setIdx(0);
    else if (e.key === 'End') setIdx(n - 1);
    else if (e.key === 'Escape') setIdx(null);
    else return;
    e.preventDefault();
  };

  const yTicks = niceTicks(lo, hi);
  const xCount = Math.max(2, Math.floor(width / 120));
  const xTicks = Array.from({ length: xCount }, (_, i) => Math.round((i * (n - 1)) / (xCount - 1)));
  const path = (vals, pick) => {
    let d = '';
    vals.forEach((v, i) => {
      const val = pick ? pick(v) : v;
      if (val === null || val === undefined) return;
      d += `${d && vals[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`;
    });
    return d;
  };

  const readout = cur
    ? `${fmtDate(cur.t, true)}: open ${money(cur.o)}, high ${money(cur.h)}, low ${money(cur.l)}, close ${money(cur.c)}, ${cur.c >= cur.o ? 'up' : 'down'}, volume ${number(cur.v)}${lines
        .map((l) => (l.vals[active] !== null ? `, ${INDICATORS[l.key].label} ${money(l.vals[active])}` : ''))
        .join('')}${showRsi && rsiVals[active] !== null ? `, RSI ${rsiVals[active].toFixed(1)}` : ''}`
    : '';
  const tipLeft = cur && x(active) > width * 0.6;
  const step = Math.max(1, Math.floor((n - 1) / 11));
  const tableRows = [];
  for (let i = 0; i < n; i += step) tableRows.push(view[i]);
  if (tableRows[tableRows.length - 1] !== view[n - 1]) tableRows.push(view[n - 1]);

  return (
    <div className="chart" ref={wrapRef}>
      <svg
        width={width}
        height={totalH}
        role="group"
        tabIndex={0}
        aria-label={`${label}. Use left and right arrow keys to inspect each trading day.`}
        onKeyDown={onKey}
        onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setIdx(null)}
        onBlur={() => setIdx(null)}
        style={{ touchAction: 'pan-y' }}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} className="grid-line" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="axis">{money(v)}</text>
          </g>
        ))}
        {xTicks.map((i, k) => (
          <text key={i} x={x(i)} y={MAIN_H - 6} textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'} className="axis">
            {fmtDate(view[i].t)}
          </text>
        ))}
        {view.map((c, i) => (
          <rect key={`v${c.t}`} x={x(i) - cw / 2} y={vy(c.v)} width={cw} height={MAIN_H - PAD.b - vy(c.v)} className={c.c >= c.o ? 'vol-up' : 'vol-down'} />
        ))}
        {mode === 'candle' ? (
          view.map((c, i) => {
            const up = c.c >= c.o;
            return (
              <g key={c.t} className={up ? 'candle-up' : 'candle-down'}>
                <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} />
                <rect x={x(i) - cw / 2} y={y(Math.max(c.o, c.c))} width={cw} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} />
              </g>
            );
          })
        ) : (
          <path d={path(view, (c) => c.c)} fill="none" stroke="var(--c1)" strokeWidth="2" strokeLinejoin="round" />
        )}
        {lines.map((l) => (
          <path key={l.key} d={path(l.vals)} fill="none" stroke={INDICATORS[l.key].color} strokeWidth="1.6" strokeDasharray={INDICATORS[l.key].dash} />
        ))}
        {showRsi && (
          <g>
            <text x={PAD.l} y={MAIN_H + 4} className="axis">RSI (14)</text>
            {[30, 70].map((v) => (
              <g key={v} transform={`translate(0,${MAIN_H})`}>
                <line x1={PAD.l} x2={width - PAD.r} y1={ry(v)} y2={ry(v)} className="grid-line" />
                <text x={PAD.l - 8} y={ry(v) + 4} textAnchor="end" className="axis">{v}</text>
              </g>
            ))}
            <g transform={`translate(0,${MAIN_H})`}>
              <path d={rsiVals.reduce((d, v, i) => (v === null ? d : `${d}${d ? 'L' : 'M'}${x(i).toFixed(1)},${ry(v).toFixed(1)}`), '')} fill="none" stroke="var(--c6)" strokeWidth="1.6" />
            </g>
          </g>
        )}
        {cur && (
          <g>
            <line x1={x(active)} x2={x(active)} y1={PAD.t} y2={totalH - 6} className="crosshair" />
          </g>
        )}
      </svg>
      {cur && (
        <div className="tooltip" style={{ left: tipLeft ? undefined : x(active) + 10, right: tipLeft ? width - x(active) + 10 : undefined }} aria-hidden="true">
          <strong>{fmtDate(cur.t, true)}</strong>
          <div>O {money(cur.o)} H {money(cur.h)}</div>
          <div>L {money(cur.l)} C {money(cur.c)}</div>
          <div>Vol {number(cur.v)}</div>
          {lines.map((l) => l.vals[active] !== null && (
            <div key={l.key}><span className="swatch" style={{ background: INDICATORS[l.key].color }} /> {INDICATORS[l.key].label}: {money(l.vals[active])}</div>
          ))}
          {showRsi && rsiVals[active] !== null && <div>RSI {rsiVals[active].toFixed(1)}</div>}
        </div>
      )}
      {lines.length > 0 && (
        <ul className="chart-legend" aria-label="Indicators">
          {lines.map((l) => (
            <li key={l.key}><span className="swatch" style={{ background: INDICATORS[l.key].color }} aria-hidden="true" /> {INDICATORS[l.key].label}</li>
          ))}
        </ul>
      )}
      <span className="sr-only" aria-live="polite">{readout}</span>
      <details className="chart-table">
        <summary>View price data as a table</summary>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Sampled daily prices</caption>
            <thead>
              <tr><th scope="col">Date</th><th scope="col" className="num">Open</th><th scope="col" className="num">High</th><th scope="col" className="num">Low</th><th scope="col" className="num">Close</th><th scope="col" className="num">Volume</th></tr>
            </thead>
            <tbody>
              {tableRows.map((c) => (
                <tr key={c.t}>
                  <th scope="row">{fmtDate(c.t, true)}</th>
                  <td className="num">{money(c.o)}</td><td className="num">{money(c.h)}</td><td className="num">{money(c.l)}</td><td className="num">{money(c.c)}</td><td className="num">{number(c.v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
