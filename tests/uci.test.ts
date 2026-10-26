import { describe, expect, it } from 'vitest';
import { formatScore, parseBestMove, parseInfo, toWhitePov } from '../src/lib/engine/uci';

describe('UCI parsing', () => {
  it('parses info lines with cp scores and PVs', () => {
    const info = parseInfo('info depth 18 seldepth 24 multipv 2 score cp -35 nodes 123456 nps 1000 pv e7e5 g1f3 b8c6');
    expect(info).toEqual({ multipv: 2, depth: 18, seldepth: 24, nodes: 123456, cp: -35, pv: ['e7e5', 'g1f3', 'b8c6'] });
  });

  it('parses mate scores and bounds', () => {
    expect(parseInfo('info depth 5 score mate -2 pv h7h8')?.mate).toBe(-2);
    expect(parseInfo('info depth 5 score cp 20 lowerbound pv e2e4')?.bound).toBe('lower');
  });

  it('ignores info strings and lines without a PV', () => {
    expect(parseInfo('info string NNUE evaluation using nn.nnue')).toBeNull();
    expect(parseInfo('info depth 0 score mate 0')).toBeNull();
    expect(parseInfo('readyok')).toBeNull();
  });

  it('parses bestmove lines including (none)', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ move: 'e2e4', ponder: 'e7e5' });
    expect(parseBestMove('bestmove (none)')).toEqual({ move: null, ponder: undefined });
    expect(parseBestMove('info depth 1')).toBeNull();
  });

  it('converts scores to White POV and formats them', () => {
    expect(toWhitePov({ cp: 50 }, 'b')).toEqual({ cp: -50, mate: undefined });
    expect(toWhitePov({ mate: 3 }, 'b').mate).toBe(-3);
    expect(formatScore({ cp: 124 })).toBe('+1.24');
    expect(formatScore({ cp: -5 })).toBe('-0.05');
    expect(formatScore({ cp: 0 })).toBe('0.00');
    expect(formatScore({ mate: -3 })).toBe('#-3');
  });
});
