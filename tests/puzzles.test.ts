import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PUZZLES, checkPuzzleMove, puzzleHint, puzzlesFromAnalyses } from '../src/lib/practice/puzzles';
import type { GameAnalysis } from '../src/lib/analysis/types';
import type { StoredGame } from '../src/lib/chess/types';

describe('built-in puzzles', () => {
  it('have legal solutions from their start positions', () => {
    expect(BUILTIN_PUZZLES.length).toBeGreaterThan(15);
    for (const p of BUILTIN_PUZZLES) {
      const c = new Chess(p.fen);
      for (const uci of p.moves) expect(() => c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }), p.id).not.toThrow();
      if (p.themes.some((t) => t.startsWith('mate-in'))) expect(c.isCheckmate(), p.id).toBe(true);
      expect(p.solver).toBe(p.fen.split(' ')[1]);
    }
  });

  it('accepts the solution and any alternative checkmate, rejects other moves', () => {
    const p = BUILTIN_PUZZLES.find((x) => x.id === 'back-rank-1')!;
    expect(checkPuzzleMove(p, 0, p.fen, 'd1d8')).toBe('solved');
    expect(checkPuzzleMove(p, 0, p.fen, 'd1d2')).toBe('wrong');
    const multi = BUILTIN_PUZZLES.find((x) => x.id === 'opera-1')!;
    expect(checkPuzzleMove(multi, 0, multi.fen, multi.moves[0])).toBe('correct');
  });

  it('gives progressively more specific hints', () => {
    const p = BUILTIN_PUZZLES.find((x) => x.id === 'opera-1')!;
    const h = [1, 2, 3, 4].map((lvl) => puzzleHint(p, 0, p.fen, lvl));
    expect(h[0].squares).toBeUndefined();
    expect(h[1].squares).toEqual(['b3']);
    expect(h[2].squares).toEqual(['b3', 'b8']);
    expect(h[3].text).toContain('Qb8+');
  });
});

describe('puzzles from your own games', () => {
  const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
  const game = { id: 'g', userColor: 'w', white: 'me', black: 'you', date: '2024.01.01' } as StoredGame;
  const mk = (gap: number) =>
    ({
      gameId: 'g',
      positions: [{ fen, depth: 10, lines: [{ multipv: 1, depth: 10, mate: 1, pv: ['d1d8'] }, { multipv: 2, depth: 10, cp: gap, pv: ['h2h3'] }], bestMove: 'd1d8' }],
      moves: [{ ply: 1, color: 'w', san: 'h3', classification: 'blunder', bestMoveUci: 'd1d8', motifs: ['missed-mate'] }],
    }) as unknown as GameAnalysis;

  it('turns clear mistakes into one-move puzzles', () => {
    const [p] = puzzlesFromAnalyses([game], [mk(0)]);
    expect(p.fen).toBe(fen);
    expect(p.moves).toEqual(['d1d8']);
    expect(p.origin?.playedSan).toBe('h3');
    expect(p.themes).toContain('mate');
  });

  it('skips positions without a clearly best move', () => {
    const close = { ...mk(0), positions: [{ ...mk(0).positions[0], lines: [{ multipv: 1, depth: 10, cp: 300, pv: ['d1d8'] }, { multipv: 2, depth: 10, cp: 280, pv: ['h2h3'] }] }] } as GameAnalysis;
    expect(puzzlesFromAnalyses([game], [close])).toHaveLength(0);
  });
});
