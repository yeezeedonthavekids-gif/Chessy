import { describe, expect, it } from 'vitest';
import { analyzeGame, toPositionEval, type Evaluator } from '../src/lib/analysis/analyzeGame';
import { classifyMove, moveAccuracy, winningChances } from '../src/lib/analysis/classify';
import { parseGame } from '../src/lib/chess/pgn';
import { AbortError } from '../src/lib/engine/engine';
import { CLOCK_GAME, OPERA_GAME } from './fixtures';

describe('classification', () => {
  it('maps centipawns to winning chances symmetrically', () => {
    expect(winningChances(0)).toBeCloseTo(0);
    expect(winningChances(300)).toBeCloseTo(-winningChances(-300));
    expect(winningChances(5000)).toBeLessThan(1);
  });

  it('uses Lichess-style thresholds', () => {
    const base = { playedBest: false, legalMoveCount: 20 };
    expect(classifyMove({ ...base, wcLoss: 0.35 })).toBe('blunder');
    expect(classifyMove({ ...base, wcLoss: 0.25 })).toBe('mistake');
    expect(classifyMove({ ...base, wcLoss: 0.12 })).toBe('inaccuracy');
    expect(classifyMove({ ...base, wcLoss: 0.05 })).toBe('good');
    expect(classifyMove({ ...base, wcLoss: 0.01 })).toBe('excellent');
    expect(classifyMove({ ...base, wcLoss: 0, playedBest: true })).toBe('best');
    expect(classifyMove({ ...base, wcLoss: 0, playedBest: true, secondBestGap: 0.5 })).toBe('only-move');
    expect(classifyMove({ wcLoss: 0.5, playedBest: false, legalMoveCount: 1 })).toBe('forced');
  });

  it('computes 100% accuracy for no loss and less for large losses', () => {
    expect(moveAccuracy(60, 60)).toBeCloseTo(100, 0);
    expect(moveAccuracy(80, 20)).toBeLessThan(15);
  });
});

/**
 * Fake evaluator: everything is level except the position after 1...e5 in the
 * Fool's-mate game, where White is "losing" — so 2.g4 becomes a blunder.
 */
function scriptedEvaluator(script: Record<string, { cp?: number; mate?: number; best: string; pv?: string[] }>): Evaluator {
  return async (fen) => {
    const key = Object.keys(script).find((k) => fen.startsWith(k));
    const s = key ? script[key] : { cp: 20, best: '' };
    const stm = fen.split(' ')[1];
    const sideCp = s.cp === undefined ? undefined : stm === 'w' ? s.cp : -s.cp;
    const sideMate = s.mate === undefined ? undefined : stm === 'w' ? s.mate : -s.mate;
    return toPositionEval(fen, {
      depth: 12,
      bestMove: s.best || null,
      lines: [{ multipv: 1, depth: 12, cp: sideCp, mate: sideMate, pv: s.pv ?? (s.best ? [s.best] : []) }],
    });
  };
}

describe('analyzeGame workflow', () => {
  it('evaluates every position, detects the mate and classifies the blunder', async () => {
    const game = { ...parseGame(CLOCK_GAME), id: 'g1' };
    const progress: number[] = [];
    // White POV evals. After 2.g4 Black mates in 1.
    const evaluate = scriptedEvaluator({
      'rnbqkbnr/pppppppp/8/8/8/5P2': { cp: -30, best: 'e7e5' },
      'rnbqkbnr/pppp1ppp/8/4p3/8/5P2': { cp: -60, best: 'e1f2' },
      'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2': { mate: -1, best: 'd8h4', pv: ['d8h4'] },
    });
    const a = await analyzeGame(game, { depth: 12, evaluate, onProgress: (d) => progress.push(d) });
    expect(a.positions).toHaveLength(5);
    expect(progress.at(-1)).toBe(5);
    expect(a.positions[4].terminal).toBe('checkmate');
    const g4 = a.moves[2];
    expect(g4.san).toBe('g4');
    expect(g4.classification).toBe('blunder');
    expect(g4.motifs).toContain('allowed-mate');
    expect(a.moves[3].classification).toBe('best');
    expect(a.white.counts.blunder).toBe(1);
    expect(a.black.accuracy).toBeGreaterThan(a.white.accuracy);
  });

  it('records time spent from clock annotations including increment', async () => {
    const game = { ...parseGame(CLOCK_GAME), id: 'g1' };
    const a = await analyzeGame(game, { depth: 8, evaluate: scriptedEvaluator({}) });
    // 180+2: White 181 after move 1 (spent 1s), then 178 (spent 181-178+2=5s).
    expect(a.moves[0].timeSpent).toBe(1);
    expect(a.moves[2].timeSpent).toBe(5);
  });

  it('marks book moves while the game follows the opening database', async () => {
    const game = { ...parseGame(OPERA_GAME), id: 'opera' };
    const book = new Set<string>();
    game.plies.slice(0, 4).forEach((p) => book.add(p.fenAfter.split(' ').slice(0, 4).join(' ')));
    const a = await analyzeGame(game, { depth: 8, evaluate: scriptedEvaluator({}), isBook: (e) => book.has(e) });
    expect(a.moves.slice(0, 4).every((m) => m.classification === 'book')).toBe(true);
    expect(a.moves[4].classification).not.toBe('book');
  });

  it('stops when aborted', async () => {
    const game = { ...parseGame(OPERA_GAME), id: 'opera' };
    const ac = new AbortController();
    let calls = 0;
    const evaluate: Evaluator = async (fen) => {
      if (++calls === 3) ac.abort();
      return scriptedEvaluator({})(fen);
    };
    await expect(analyzeGame(game, { depth: 8, evaluate, signal: ac.signal })).rejects.toBeInstanceOf(AbortError);
    expect(calls).toBe(3);
  });
});
