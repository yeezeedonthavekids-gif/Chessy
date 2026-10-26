import { describe, expect, it } from 'vitest';
import { epd, formatLine, isValidFen, parseClock, parseGame, parsePgnCollection, splitPgn, uciLineToSan } from '../src/lib/chess/pgn';
import { START_FEN } from '../src/lib/chess/types';
import { CLOCK_GAME, MULTI, OPERA_GAME, UNFINISHED_GAME } from './fixtures';

describe('PGN parsing', () => {
  it('parses headers, plies and the result of a complete game', () => {
    const g = parseGame(OPERA_GAME);
    expect(g.headers.White).toBe('Paul Morphy');
    expect(g.plies).toHaveLength(33);
    expect(g.plies[0]).toMatchObject({ ply: 1, moveNumber: 1, color: 'w', san: 'e4', uci: 'e2e4', fenBefore: START_FEN });
    expect(g.plies[32].san).toBe('Rd8#');
    expect(g.result).toBe('1-0');
    expect(g.finished).toBe(true);
  });

  it('records castling and promotion in UCI form', () => {
    const g = parseGame(OPERA_GAME);
    expect(g.plies.find((p) => p.san === 'O-O-O')?.uci).toBe('e1c1');
    const promo = parseGame('[Result "*"]\n\n1. a4 h5 2. a5 h4 3. a6 h3 4. axb7 hxg2 5. bxa8=Q gxh1=N *');
    expect(promo.plies[8].uci).toBe('b7a8q');
    expect(promo.plies[9].uci).toBe('g2h1n');
  });

  it('extracts [%clk] annotations as seconds', () => {
    const g = parseGame(CLOCK_GAME);
    expect(g.plies.map((p) => p.clock)).toEqual([181, 180.5, 178, 175]);
    expect(parseClock('[%clk 1:00:00]')).toBe(3600);
    expect(parseClock('no clock')).toBeUndefined();
  });

  it('treats "*" results as unfinished unless the position is terminal', () => {
    const g = parseGame(UNFINISHED_GAME);
    expect(g.finished).toBe(false);
    expect(g.result).toBe('*');
    const mated = parseGame('[Result "*"]\n\n1. f3 e5 2. g4 Qh4# *');
    expect(mated.finished).toBe(true);
    expect(mated.result).toBe('0-1');
  });

  it('supports games starting from a custom FEN', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const g = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n[Result "1-0"]\n\n1. Rd8# 1-0`);
    expect(g.startFen).toBe(fen);
    expect(g.plies[0].san).toBe('Rd8#');
  });

  it('splits multi-game files and reports malformed games without throwing', () => {
    expect(splitPgn(MULTI)).toHaveLength(3);
    const { games, errors } = parsePgnCollection(MULTI);
    expect(games).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].index).toBe(2);
  });

  it('rejects input with no games', () => {
    expect(() => parsePgnCollection('   ')).toThrow(/No games/);
  });

  it('rejects illegal moves', () => {
    expect(() => parseGame('1. e4 e5 2. Qxf7 *')).toThrow();
  });
});

describe('notation helpers', () => {
  it('converts UCI lines to SAN and stops at illegal moves', () => {
    expect(uciLineToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
    expect(uciLineToSan(START_FEN, ['e2e4', 'e2e4'])).toEqual(['e4']);
  });

  it('formats lines with move numbers for either side to move', () => {
    expect(formatLine(START_FEN, ['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
    const black = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(formatLine(black, ['e5', 'Nf3'])).toBe('1...e5 2. Nf3');
  });

  it('validates FEN strings and strips move counters', () => {
    expect(isValidFen(START_FEN)).toBe(true);
    expect(isValidFen('not a fen')).toBe(false);
    expect(epd(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });
});
