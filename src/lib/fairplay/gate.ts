import { epd } from '../chess/pgn';

/**
 * Fair-play gate. Every engine request in the app passes through `checkAnalysis`.
 *
 * Chessy never reads live game pages or overlays anything on them. The gate adds
 * defence in depth on top of that architecture:
 *  - imported games must be verifiably finished before the engine will touch them;
 *  - all engine features lock while the user is known to be playing on Lichess
 *    (public status API) or has declared themselves "in a game";
 *  - standalone training positions are refused if they match the current position
 *    of any of the user's ongoing Chess.com daily games.
 */

export type AnalysisContext =
  | { kind: 'completed-game'; finished: boolean; result: string }
  | { kind: 'training'; fen: string };

export interface LiveStatus {
  /** Lichess `playing` flag from the public users/status endpoint; null = unknown/not linked. */
  lichessPlaying: boolean | null;
  /** EPDs of the user's ongoing Chess.com daily games. */
  ongoingDailyPositions: string[];
  /** Unix ms until which the user has locked analysis themselves. */
  selfLockUntil: number | null;
  lastChecked: number | null;
  checkError?: string;
}

export const initialLiveStatus: LiveStatus = {
  lichessPlaying: null,
  ongoingDailyPositions: [],
  selfLockUntil: null,
  lastChecked: null,
};

export type GateDecision = { allowed: true } | { allowed: false; code: GateCode; reason: string };

export type GateCode = 'self-lock' | 'live-game' | 'unfinished-game' | 'ongoing-daily-position';

export function isGloballyLocked(status: LiveStatus, now = Date.now()): GateDecision {
  if (status.selfLockUntil !== null && status.selfLockUntil > now) {
    return {
      allowed: false,
      code: 'self-lock',
      reason: 'You turned on "I\'m playing" mode. Engine analysis, hints and evaluations are paused until it ends.',
    };
  }
  if (status.lichessPlaying) {
    return {
      allowed: false,
      code: 'live-game',
      reason:
        'Lichess reports that you are currently in a game. All engine features are paused until the game ends. Good luck!',
    };
  }
  return { allowed: true };
}

export function checkAnalysis(ctx: AnalysisContext, status: LiveStatus, now = Date.now()): GateDecision {
  const global = isGloballyLocked(status, now);
  if (!global.allowed) return global;

  if (ctx.kind === 'completed-game') {
    if (!ctx.finished || ctx.result === '*') {
      return {
        allowed: false,
        code: 'unfinished-game',
        reason:
          'This game has no final result, so Chessy cannot confirm it is over. Engine analysis is only available for completed games. Re-import it after the game ends.',
      };
    }
    return { allowed: true };
  }

  const key = epd(ctx.fen);
  if (status.ongoingDailyPositions.some((p) => p === key)) {
    return {
      allowed: false,
      code: 'ongoing-daily-position',
      reason:
        'This position matches one of your ongoing Chess.com daily games. Chessy will not analyse positions from games in progress.',
    };
  }
  return { allowed: true };
}
