import type { Color } from '../chess/types';
import type { MoveClass, PositionEval } from './types';

/** Lichess winning-chances curve: maps centipawns to [-1, 1]. */
export function winningChances(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 2 / (1 + Math.exp(-0.00368208 * clamped)) - 1;
}

/** White-POV winning chances for a position evaluation. */
export function evalWinningChances(e: Pick<PositionEval, 'cp' | 'mate' | 'terminal'>): number {
  if (e.mate !== undefined) {
    if (e.mate === 0) return 0; // resolved by caller via terminal state; neutral fallback
    return e.mate > 0 ? 1 : -1;
  }
  return winningChances(e.cp ?? 0);
}

/** White-POV centipawns with mates mapped to ±1000 for averaging. */
export function evalCp(e: Pick<PositionEval, 'cp' | 'mate'>): number {
  if (e.mate !== undefined) return e.mate > 0 ? 1000 : e.mate < 0 ? -1000 : 0;
  return Math.max(-1000, Math.min(1000, e.cp ?? 0));
}

export function povChances(whiteChances: number, color: Color): number {
  return color === 'w' ? whiteChances : -whiteChances;
}

/** Lichess per-move accuracy from win-percentage before/after (0-100 scale). */
export function moveAccuracy(winPctBefore: number, winPctAfter: number): number {
  const diff = Math.max(0, winPctBefore - winPctAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * diff) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/** Thresholds on loss of winning chances (scale [-1, 1]); same as Lichess. */
export const THRESHOLDS = { inaccuracy: 0.1, mistake: 0.2, blunder: 0.3 } as const;

export interface ClassifyInput {
  wcLoss: number;
  playedBest: boolean;
  legalMoveCount: number;
  /** Mover-POV winning-chance gap between the engine's 1st and 2nd choice, when known. */
  secondBestGap?: number;
  inBook?: boolean;
}

export function classifyMove(i: ClassifyInput): MoveClass {
  if (i.legalMoveCount === 1) return 'forced';
  if (i.inBook && i.wcLoss < THRESHOLDS.inaccuracy) return 'book';
  if (i.playedBest) {
    return i.secondBestGap !== undefined && i.secondBestGap >= THRESHOLDS.blunder ? 'only-move' : 'best';
  }
  if (i.wcLoss >= THRESHOLDS.blunder) return 'blunder';
  if (i.wcLoss >= THRESHOLDS.mistake) return 'mistake';
  if (i.wcLoss >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (i.wcLoss < 0.02) return 'excellent';
  return 'good';
}

export const CLASS_LABEL: Record<MoveClass, string> = {
  book: 'Book',
  forced: 'Forced',
  'only-move': 'Only move',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

export const CLASS_SYMBOL: Partial<Record<MoveClass, string>> = {
  'only-move': '!',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};
