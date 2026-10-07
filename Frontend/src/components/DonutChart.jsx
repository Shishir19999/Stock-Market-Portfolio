import { useState } from 'react';
import { money } from '../lib/format.js';

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)'];
const colorFor = (slice, i) => (slice.label === 'Cash' ? 'var(--c-cash)' : slice.label === 'Other' ? 'var(--c-other)' : COLORS[i % COLORS.length]);

export default function DonutChart({ slices, centerLabel = 'Total', centerValue }) {
  const [active, setActive] = useState(null);
  const R = 70;
  const C = 2 * Math.PI * R;
  const offsets = slices.map((_, i) => slices.slice(0, i).reduce((t, x) => t + (x.share / 100) * C, 0));
  const summary = slices.map((s) => `${s.label} ${s.share.toFixed(1)}%`).join(', ');
  const current = active !== null ? slices[active] : null;
  return (
    <div className="donut">
      <svg viewBox="0 0 200 200" role="img" aria-label={`Allocation: ${summary}`} className="donut-svg">
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--border)" strokeWidth="26" />
        {slices.map((s, i) => {
          const len = (s.share / 100) * C;
          return (
            <circle
              key={s.label}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={colorFor(s, i)}
              strokeWidth={active === i ? 30 : 26}
              strokeDasharray={`${Math.max(0, len - (slices.length > 1 ? 1.5 : 0))} ${C}`}
              strokeDashoffset={-offsets[i]}
              transform="rotate(-90 100 100)"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              style={{ transition: 'stroke-width .15s' }}
            />
          );
        })}
        <text x="100" y="94" textAnchor="middle" className="donut-label">{current ? current.label : centerLabel}</text>
        <text x="100" y="116" textAnchor="middle" className="donut-value">
          {current ? `${current.share.toFixed(1)}%` : centerValue}
        </text>
      </svg>
      <ul className="legend">
        {slices.map((s, i) => (
          <li
            key={s.label}
            className={active === i ? 'active' : ''}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="swatch" style={{ background: colorFor(s, i) }} aria-hidden="true" />
            <span className="legend-name">{s.label}</span>
            <span className="legend-val">{s.share.toFixed(1)}%</span>
            <span className="legend-money muted">{money(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
