import type { StoredGame } from './chess/types';

export function formatDate(ms: number | undefined, fallback?: string): string {
  if (!ms) return fallback ?? '';
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function opponentOf(g: StoredGame): { name: string; elo?: number } {
  if (g.userColor === 'b') return { name: g.white, elo: g.whiteElo };
  if (g.userColor === 'w') return { name: g.black, elo: g.blackElo };
  return { name: `${g.white} vs ${g.black}` };
}

export function timeControlLabel(tc?: string): string {
  if (!tc || tc === '-' || tc === '?') return '';
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return tc.includes('/') ? 'Daily' : tc;
  const base = Number(m[1]);
  const inc = Number(m[2] ?? 0);
  const label = base >= 60 ? `${Math.round(base / 60)}` : `${base}s`;
  const total = base + 40 * inc;
  const kind = total < 180 ? 'Bullet' : total < 480 ? 'Blitz' : total < 1500 ? 'Rapid' : 'Classical';
  return `${kind} ${label}+${inc}`;
}

export const SOURCE_LABEL = { pgn: 'PGN', chesscom: 'Chess.com', lichess: 'Lichess' } as const;
