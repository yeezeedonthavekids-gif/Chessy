import { Chess, type Square, type PieceSymbol } from 'chess.js';
import type { Color } from './types';
import type { Phase } from '../analysis/types';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export interface Material {
  w: number;
  b: number;
  /** Non-pawn material (N/B/R/Q) per side. */
  wPieces: number;
  bPieces: number;
  queens: number;
}

export function material(chess: Chess): Material {
  const m: Material = { w: 0, b: 0, wPieces: 0, bPieces: 0, queens: 0 };
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const v = PIECE_VALUE[sq.type];
      m[sq.color] += v;
      if (sq.type !== 'p' && sq.type !== 'k') {
        if (sq.color === 'w') m.wPieces += v;
        else m.bPieces += v;
      }
      if (sq.type === 'q') m.queens++;
    }
  }
  return m;
}

/** Material balance from `color`'s point of view. */
export function materialBalance(chess: Chess, color: Color): number {
  const m = material(chess);
  return color === 'w' ? m.w - m.b : m.b - m.w;
}

/** Game phase heuristic based on remaining non-pawn material and move number. */
export function gamePhase(fen: string, ply: number): Phase {
  const m = material(new Chess(fen));
  const pieces = m.wPieces + m.bPieces;
  if (pieces <= 26 || (m.queens === 0 && pieces <= 32)) return 'endgame';
  if (ply <= 20 && pieces >= 56) return 'opening';
  return 'middlegame';
}

export function squaresOf(chess: Chess, color: Color): { square: Square; type: PieceSymbol }[] {
  const out: { square: Square; type: PieceSymbol }[] = [];
  for (const row of chess.board()) {
    for (const sq of row) if (sq && sq.color === color) out.push({ square: sq.square, type: sq.type });
  }
  return out;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/**
 * Pieces of `color` that can be won: attacked and undefended, or attacked by a
 * cheaper piece. Kings and pawns defended by pawns are ignored.
 */
export function hangingPieces(chess: Chess, color: Color): { square: Square; type: PieceSymbol }[] {
  const enemy = other(color);
  return squaresOf(chess, color).filter(({ square, type }) => {
    if (type === 'k') return false;
    const attackers = chess.attackers(square, enemy);
    if (attackers.length === 0) return false;
    const defenders = chess.attackers(square, color);
    if (defenders.length === 0) return true;
    const cheapest = Math.min(...attackers.map((s) => PIECE_VALUE[chess.get(s)!.type] || 100));
    return cheapest < PIECE_VALUE[type];
  });
}

/**
 * Detects a fork created by the piece standing on `square`: it attacks two or
 * more enemy targets that are the king, more valuable than the forker, or undefended.
 */
export function forkTargets(chess: Chess, square: Square): Square[] {
  const piece = chess.get(square);
  if (!piece) return [];
  const enemy = other(piece.color);
  const targets: Square[] = [];
  for (const { square: t, type } of squaresOf(chess, enemy)) {
    if (!chess.attackers(t, piece.color).includes(square)) continue;
    const valuable = type === 'k' || PIECE_VALUE[type] > PIECE_VALUE[piece.type];
    const loose = type !== 'p' && chess.attackers(t, enemy).length === 0;
    if (valuable || loose) targets.push(t);
  }
  // A forking piece that can simply be captured for free is not a real fork.
  const attacked = chess.attackers(square, enemy).length > 0;
  const defended = chess.attackers(square, piece.color).length > 0;
  if (attacked && !defended && piece.type !== 'p') return [];
  return targets.length >= 2 ? targets : [];
}

/** Plays SAN moves from `fen` and returns material balance (mover POV) after each ply. */
export function materialAlongLine(fen: string, sans: string[], pov: Color, maxPlies = 4): number[] {
  const chess = new Chess(fen);
  const out: number[] = [];
  for (const san of sans.slice(0, maxPlies)) {
    try {
      chess.move(san);
    } catch {
      break;
    }
    out.push(materialBalance(chess, pov));
  }
  return out;
}

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export function legalMoveCount(fen: string): number {
  return new Chess(fen).moves().length;
}

/** FEN with the side to move flipped (en passant cleared) — used to count the opponent's options. */
export function flipTurn(fen: string): string {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  return parts.join(' ');
}
