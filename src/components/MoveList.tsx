import { useEffect, useRef } from 'react';
import type { Ply } from '../lib/chess/types';
import type { MoveAnalysis } from '../lib/analysis/types';
import { CLASS_SYMBOL } from '../lib/analysis/classify';

export function MoveList({ plies, analysis, current, onSelect }: { plies: Ply[]; analysis?: MoveAnalysis[]; current: number; onSelect: (ply: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll within the list only; scrollIntoView would also scroll the page.
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>('.current');
    if (!box || !el) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop) box.scrollTop = top - 8;
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + el.offsetHeight - box.clientHeight + 8;
  }, [current]);
  const rows: { no: number; w?: Ply; b?: Ply }[] = [];
  for (const p of plies) {
    if (p.color === 'w' || rows.length === 0) rows.push({ no: p.moveNumber, [p.color]: p });
    else rows[rows.length - 1].b = p;
  }
  const cell = (p?: Ply) => {
    if (!p) return <span />;
    const a = analysis?.[p.ply - 1];
    const sym = a ? CLASS_SYMBOL[a.classification] : undefined;
    return (
      <button className={current === p.ply ? 'current' : ''} onClick={() => onSelect(p.ply)}>
        {p.san}
        {sym && <span className={`mclass ${a!.classification}`}>{sym}</span>}
      </button>
    );
  };
  return (
    <div className="moves" ref={ref}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <span className="no">{r.no}.</span>
          {cell(r.w)}
          {cell(r.b)}
        </div>
      ))}
    </div>
  );
}
