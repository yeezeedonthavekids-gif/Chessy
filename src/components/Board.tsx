import { Chess, type Square } from 'chess.js';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { settingsStore } from '../state/settings';
import { useStore } from '../state/store';

const THEMES = {
  green: { light: '#ebecd0', dark: '#739552' },
  brown: { light: '#f0d9b5', dark: '#b58863' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  slate: { light: '#c9cfd6', dark: '#5f6b78' },
} as const;

export type Arrow = [Square, Square, string?];

export interface BoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  /** Called with a UCI move; return false to reject. Omit for a read-only board. */
  onMove?: (uci: string) => boolean;
  /** Restrict moving to one side (e.g. the puzzle solver). */
  movableColor?: 'w' | 'b';
  arrows?: Arrow[];
  lastMove?: [string, string] | null;
  highlights?: Partial<Record<string, string>>;
  id?: string;
}

/** Chessboard with drag-and-drop, click-to-move, legal-move dots and promotion. */
export function Board({ fen, orientation = 'white', onMove, movableColor, arrows = [], lastMove, highlights = {}, id = 'board' }: BoardProps) {
  const { boardTheme } = useStore(settingsStore);
  const theme = THEMES[boardTheme] ?? THEMES.green;
  const [selected, setSelected] = useState<Square | null>(null);
  // react-chessboard 4.x can restore a stale position when a new one arrives
  // mid-animation (its pending animation timeout is not always cleared). Animate
  // only isolated changes; during rapid stepping, remount with the new position.
  const lastChange = useRef({ fen, at: 0, animate: true });
  if (lastChange.current.fen !== fen) {
    const now = performance.now();
    lastChange.current = { fen, at: now, animate: now - lastChange.current.at > 400 };
  }
  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const canMove = (sq: Square) => {
    if (!onMove || !chess) return false;
    const p = chess.get(sq);
    if (!p || p.color !== chess.turn()) return false;
    return !movableColor || p.color === movableColor;
  };

  const tryMove = (from: Square, to: Square, promotion?: string): boolean => {
    if (!chess || !onMove) return false;
    const legal = chess.moves({ square: from, verbose: true }).find((m) => m.to === to);
    if (!legal) return false;
    const promo = legal.promotion ? promotion ?? 'q' : '';
    setSelected(null);
    return onMove(`${from}${to}${promo}`);
  };

  const legalTargets = useMemo(() => {
    if (!selected || !chess) return [];
    return chess.moves({ square: selected, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured }));
  }, [selected, chess]);

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove[0]] = { background: 'rgba(242, 193, 78, 0.38)' };
    squareStyles[lastMove[1]] = { background: 'rgba(242, 193, 78, 0.5)' };
  }
  for (const [sq, color] of Object.entries(highlights)) squareStyles[sq] = { background: color };
  if (chess?.inCheck()) {
    const king = chess.board().flat().find((p) => p && p.type === 'k' && p.color === chess.turn());
    if (king) squareStyles[king.square] = { background: 'radial-gradient(circle, rgba(239,80,80,0.85) 0%, rgba(239,80,80,0.3) 55%, transparent 75%)' };
  }
  if (selected) squareStyles[selected] = { background: 'rgba(110, 168, 254, 0.45)' };
  for (const t of legalTargets) {
    squareStyles[t.to] = t.capture
      ? { background: 'radial-gradient(circle, transparent 58%, rgba(0,0,0,0.22) 60%)' }
      : { background: 'radial-gradient(circle, rgba(0,0,0,0.22) 22%, transparent 24%)' };
  }

  return (
    <div className="board-wrap">
      <Chessboard
        key={lastChange.current.animate ? 'animated' : `jump-${fen}`}
        id={id}
        position={fen}
        boardOrientation={orientation}
        arePiecesDraggable={!!onMove}
        isDraggablePiece={({ sourceSquare }) => canMove(sourceSquare)}
        onPieceDrop={(from, to, piece) => {
          const promotion = piece[1]?.toLowerCase();
          return tryMove(from, to, promotion === 'p' ? undefined : promotion);
        }}
        onSquareClick={(sq) => {
          if (selected && selected !== sq && legalTargets.some((t) => t.to === sq)) {
            // Click-to-move promotes to a queen; drag to choose another piece.
            tryMove(selected, sq);
            return;
          }
          setSelected(canMove(sq) && selected !== sq ? sq : null);
        }}
        customArrows={arrows.map(([a, b, c]) => [a, b, c ?? 'rgba(110,168,254,0.8)']) as never}
        customSquareStyles={squareStyles}
        customDarkSquareStyle={{ backgroundColor: theme.dark }}
        customLightSquareStyle={{ backgroundColor: theme.light }}
        customBoardStyle={{ borderRadius: '8px', boxShadow: '0 6px 24px rgba(0,0,0,0.28)' }}
        animationDuration={lastChange.current.animate ? 160 : 0}
        areArrowsAllowed
      />
    </div>
  );
}
