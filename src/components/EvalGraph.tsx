import { positionChances } from '../lib/analysis/analyzeGame';
import type { GameAnalysis } from '../lib/analysis/types';

const MARK: Record<string, string> = { blunder: 'var(--red)', mistake: 'var(--orange)', inaccuracy: 'var(--yellow)' };

/** White-POV winning-chances graph over the whole game; click to jump to a ply. */
export function EvalGraph({ analysis, ply, onSelect }: { analysis: GameAnalysis; ply: number; onSelect: (ply: number) => void }) {
  const W = 600;
  const H = 110;
  const n = analysis.positions.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (wc: number) => H / 2 - (wc * H) / 2.1;
  const pts = analysis.positions.map((p, i) => [x(i), y(positionChances(p))] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg
      className="graph"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Evaluation graph"
      onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const i = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
        onSelect(Math.max(0, Math.min(n - 1, i)));
      }}
    >
      <rect x="0" y="0" width={W} height={H} fill="#2a2d31" />
      <path d={area} fill="#e9e9e6" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(128,128,128,0.5)" strokeDasharray="4 4" />
      {analysis.moves.map((m) =>
        MARK[m.classification] ? (
          <circle key={m.ply} cx={x(m.ply)} cy={pts[m.ply][1]} r="4" fill={MARK[m.classification]} stroke="#111" strokeWidth="1" />
        ) : null,
      )}
      <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
