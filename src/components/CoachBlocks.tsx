import type { CoachBlock } from '../lib/coach/types';
import { IconAlert } from './Icons';

export function SourceLabel({ source }: { source: 'engine' | 'coach' | 'ai' | 'heuristic' }) {
  const text = {
    engine: 'Engine-verified · Stockfish',
    coach: 'Coach explanation',
    ai: 'AI explanation · not engine-verified',
    heuristic: 'Pattern detection · heuristic',
  }[source];
  return <span className={`src ${source}`}>{text}</span>;
}

/** Renders coach blocks with a visible label for where each piece came from. */
export function CoachBlocks({ blocks }: { blocks: CoachBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'engine':
            return (
              <div key={i} className="block engine">
                <div className="row spread" style={{ marginBottom: 4 }}>
                  <SourceLabel source="engine" />
                  <span className="small faint">{b.title}</span>
                </div>
                {b.lines.map((l, j) => (
                  <p key={j} className="small" style={{ fontFamily: l.includes('line') || l.includes('reply') ? undefined : undefined }}>
                    {l}
                  </p>
                ))}
                {b.note && <p className="small faint" style={{ marginTop: 4 }}>{b.note}</p>}
              </div>
            );
          case 'text':
            return (
              <div key={i} className={`block ${b.source === 'ai' ? 'ai' : ''}`}>
                <div style={{ marginBottom: 4 }}>
                  <SourceLabel source={b.source} />
                </div>
                {b.text.split('\n\n').map((para, j) => (
                  <p key={j} style={{ whiteSpace: 'pre-wrap' }}>
                    {para}
                  </p>
                ))}
                {b.bullets && (
                  <ul>
                    {b.bullets.map((x, j) => (
                      <li key={j}>{x}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          case 'heuristic':
            return (
              <div key={i} className="block">
                <div style={{ marginBottom: 4 }}>
                  <SourceLabel source="heuristic" />
                </div>
                <p>{b.text}</p>
                {b.bullets && (
                  <ul>
                    {b.bullets.map((x, j) => (
                      <li key={j}>{x}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          case 'warning':
            return (
              <div key={i} className="notice warn">
                <IconAlert />
                <span>{b.text}</span>
              </div>
            );
          case 'board':
            return null; // rendered by the host page when supported
          default:
            return null;
        }
      })}
    </>
  );
}
