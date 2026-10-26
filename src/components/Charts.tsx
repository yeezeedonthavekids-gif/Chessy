import { useState } from 'react';

/** Single-series line chart (0–100) with a hover crosshair and tooltip. */
export function TrendChart({ points, label }: { points: { x: number; y: number; tip: string }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 180;
  const pad = { l: 34, r: 12, t: 10, b: 22 };
  const n = points.length;
  const ys = points.map((p) => p.y);
  const lo = Math.max(0, Math.floor((Math.min(...ys) - 5) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...ys) + 5) / 10) * 10);
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  const h = hover !== null ? points[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)">{Math.round(t)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {n <= 40 && points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.y)} r="3" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />)}
        {h && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--text-faint)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.y)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </>
        )}
        <text x={pad.l} y={H - 4} fontSize="11" fill="var(--text-faint)">Oldest</text>
        <text x={W - pad.r} y={H - 4} fontSize="11" fill="var(--text-faint)" textAnchor="end">Most recent</text>
      </svg>
      {h && hover !== null && (
        <div
          className="small"
          style={{
            position: 'absolute',
            top: 0,
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${hover > n / 2 ? '-105%' : '5%'})`,
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '6px 9px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow)',
          }}
        >
          {h.tip}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for a handful of categories, values labelled directly. */
export function BarList({ rows, format, max }: { rows: { label: string; value: number; note?: string }[]; format: (v: number) => string; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="stack" style={{ gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="row spread small" style={{ marginBottom: 4 }}>
            <span className="muted">{r.label}</span>
            <span className="mono">
              {format(r.value)}
              {r.note && <span className="faint"> · {r.note}</span>}
            </span>
          </div>
          <div className="progress" style={{ height: 8 }}>
            <div style={{ width: `${(r.value / top) * 100}%`, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Win/draw/loss split with explicit numbers (colour is never the only cue). */
export function WdlRow({ label, wdl }: { label: string; wdl: { win: number; draw: number; loss: number } }) {
  const t = wdl.win + wdl.draw + wdl.loss;
  const p = (v: number) => (t ? Math.round((v / t) * 100) : 0);
  return (
    <div>
      <div className="row spread small" style={{ marginBottom: 4 }}>
        <span className="muted">{label} <span className="faint">({t} games)</span></span>
        <span className="mono">
          <span style={{ color: 'var(--green)' }}>W {p(wdl.win)}%</span> · D {p(wdl.draw)}% · <span style={{ color: 'var(--red)' }}>L {p(wdl.loss)}%</span>
        </span>
      </div>
      <div className="wdl" style={{ gap: 2, background: 'transparent' }}>
        {t ? (
          <>
            <div className="w" style={{ width: `${p(wdl.win)}%` }} />
            <div className="d" style={{ width: `${p(wdl.draw)}%` }} />
            <div className="l" style={{ width: `${p(wdl.loss)}%` }} />
          </>
        ) : (
          <div style={{ width: '100%', background: 'var(--surface-2)' }} />
        )}
      </div>
    </div>
  );
}
