import { formatScore } from '../lib/engine/uci';
import { winningChances } from '../lib/analysis/classify';

export function EvalBar({
  cp,
  mate,
  terminal,
  sideToMove,
  orientation = 'white',
  locked = false,
}: {
  cp?: number;
  mate?: number;
  terminal?: string;
  sideToMove?: 'w' | 'b';
  orientation?: 'white' | 'black';
  locked?: boolean;
}) {
  if (locked) return <div className="evalbar locked" title="Evaluation unavailable" />;
  const known = cp !== undefined || mate !== undefined || terminal;
  let wc = 0;
  if (terminal === 'checkmate') wc = sideToMove === 'w' ? -1 : 1;
  else if (mate !== undefined) wc = mate > 0 ? 1 : mate < 0 ? -1 : 0;
  else if (cp !== undefined) wc = winningChances(cp);
  const whitePct = known ? 50 + 50 * wc : 50;
  // One decimal fits the narrow bar ("2.9", "M3"); the full score is in the tooltip.
  const label = !known
    ? ''
    : terminal === 'checkmate'
      ? '#'
      : terminal
        ? '½'
        : mate !== undefined
          ? `M${Math.abs(mate)}`
          : Math.abs((cp ?? 0) / 100).toFixed(Math.abs(cp ?? 0) >= 1000 ? 0 : 1);
  const flipped = orientation === 'black';
  const whiteAhead = whitePct >= 50;
  return (
    <div className="evalbar" title={known ? `Engine evaluation: ${formatScore({ cp, mate })}` : 'Not evaluated'} style={flipped ? { transform: 'rotate(180deg)' } : undefined}>
      <div className="white" style={{ height: `${whitePct}%` }} />
      {label && (
        <div
          className="label"
          style={{
            [whiteAhead ? 'bottom' : 'top']: 4,
            color: whiteAhead ? '#222' : '#eee',
            transform: flipped ? 'rotate(180deg)' : undefined,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
