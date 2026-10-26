import { describe, expect, it } from 'vitest';
import { describeMoveEffect, explainSolution } from '../src/lib/coach/explain';
import { BUILTIN_PUZZLES } from '../src/lib/practice/puzzles';
import { uciLineToSan } from '../src/lib/chess/pgn';

describe('coach explanations', () => {
  it('narrates a queen sacrifice leading to mate', () => {
    const p = BUILTIN_PUZZLES.find((x) => x.id === 'opera-1')!;
    const text = explainSolution(p.fen, uciLineToSan(p.fen, p.moves));
    expect(text).toContain('Qb8+');
    expect(text).toContain('sacrifice');
    expect(text).toContain('The only reply is Nxb8');
    expect(text).toContain('Rd8# is checkmate');
  });

  it('reports material won by a fork', () => {
    const p = BUILTIN_PUZZLES.find((x) => x.id === 'fork-1')!;
    const text = explainSolution(p.fen, uciLineToSan(p.fen, p.moves));
    expect(text).toMatch(/attacks .*king on e8 and rook on a8|attacks .*rook on a8 and king on e8/);
    expect(text).toMatch(/wins about 5 points/);
  });

  it('does not call a defended quiet move a sacrifice', () => {
    expect(describeMoveEffect('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'Nf3')).toEqual([]);
  });
});
