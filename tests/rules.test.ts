import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { forkTargets, gamePhase, hangingPieces, materialBalance, materialAlongLine } from '../src/lib/chess/position';
import { START_FEN } from '../src/lib/chess/types';
import { terminalEval } from '../src/lib/analysis/analyzeGame';

describe('legal moves and game status', () => {
  it('has 20 legal moves from the initial position', () => {
    expect(new Chess().moves()).toHaveLength(20);
  });

  it('rejects illegal moves', () => {
    const c = new Chess();
    expect(() => c.move('e5')).toThrow();
    expect(() => c.move({ from: 'e2', to: 'e5' })).toThrow();
  });

  it('detects checkmate, stalemate and insufficient material as terminal', () => {
    expect(terminalEval('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')?.terminal).toBe('checkmate');
    expect(terminalEval('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')?.terminal).toBe('stalemate');
    expect(terminalEval('8/8/8/4k3/8/8/4K3/8 w - - 0 1')?.terminal).toBe('draw');
    expect(terminalEval(START_FEN)).toBeNull();
  });
});

describe('position heuristics', () => {
  it('computes material balance', () => {
    const c = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(materialBalance(c, 'w')).toBe(5);
    expect(materialBalance(c, 'b')).toBe(-5);
  });

  it('classifies game phases', () => {
    expect(gamePhase(START_FEN, 1)).toBe('opening');
    expect(gamePhase('4k3/8/8/8/8/8/4P3/R3K3 w - - 0 40', 80)).toBe('endgame');
  });

  it('finds undefended attacked pieces', () => {
    // Black knight on e5 attacked by the f3 knight? No: by the d4 pawn, and undefended.
    const c = new Chess('4k3/8/8/4n3/3P4/8/8/4K3 b - - 0 1');
    expect(hangingPieces(c, 'b').map((p) => p.square)).toEqual(['e5']);
  });

  it('detects a knight fork of king and rook', () => {
    const c = new Chess('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1');
    c.move('Nc7+');
    expect(forkTargets(c, 'c7').sort()).toEqual(['a8', 'e8']);
  });

  it('tracks material along a line', () => {
    expect(materialAlongLine('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', ['Rxd5', 'Kf7'], 'w')).toEqual([5, 5]);
  });
});
