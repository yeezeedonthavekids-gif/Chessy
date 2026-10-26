import { describe, expect, it } from 'vitest';
import { checkAnalysis, initialLiveStatus, isGloballyLocked } from '../src/lib/fairplay/gate';
import { epd } from '../src/lib/chess/pgn';

const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

describe('fair-play gate', () => {
  it('allows completed games and training positions by default', () => {
    expect(checkAnalysis({ kind: 'completed-game', finished: true, result: '1-0' }, initialLiveStatus).allowed).toBe(true);
    expect(checkAnalysis({ kind: 'training', fen: FEN }, initialLiveStatus).allowed).toBe(true);
  });

  it('refuses games without a final result', () => {
    const d = checkAnalysis({ kind: 'completed-game', finished: false, result: '*' }, initialLiveStatus);
    expect(d.allowed).toBe(false);
    expect(!d.allowed && d.code).toBe('unfinished-game');
    expect(checkAnalysis({ kind: 'completed-game', finished: true, result: '*' }, initialLiveStatus).allowed).toBe(false);
  });

  it('locks everything while Lichess reports a live game', () => {
    const live = { ...initialLiveStatus, lichessPlaying: true };
    expect(checkAnalysis({ kind: 'completed-game', finished: true, result: '1-0' }, live).allowed).toBe(false);
    expect(checkAnalysis({ kind: 'training', fen: FEN }, live).allowed).toBe(false);
    expect(isGloballyLocked(live).allowed).toBe(false);
  });

  it('honours the self-declared lock until it expires', () => {
    const now = 1_000_000;
    const locked = { ...initialLiveStatus, selfLockUntil: now + 60_000 };
    expect(isGloballyLocked(locked, now).allowed).toBe(false);
    expect(isGloballyLocked(locked, now + 61_000).allowed).toBe(true);
  });

  it('refuses training positions that match an ongoing daily game, ignoring move counters', () => {
    const status = { ...initialLiveStatus, ongoingDailyPositions: [epd(FEN)] };
    const sameBoardOtherCounters = FEN.replace(/ 2 3$/, ' 0 9');
    const d = checkAnalysis({ kind: 'training', fen: sameBoardOtherCounters }, status);
    expect(d.allowed).toBe(false);
    expect(!d.allowed && d.code).toBe('ongoing-daily-position');
    expect(checkAnalysis({ kind: 'training', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }, status).allowed).toBe(true);
  });
});
