import { describe, expect, it } from 'vitest';
import { analyzeGame, toPositionEval, type Evaluator } from '../src/lib/analysis/analyzeGame';
import { parseGame } from '../src/lib/chess/pgn';
import { detectIntent, respond } from '../src/lib/coach/localCoach';
import { analyzeFeatures, describeFeatures } from '../src/lib/coach/features';
import { extractSanMentions, unverifiedMoves } from '../src/lib/coach/verify';
import { buildContext } from '../src/lib/coach/llm';
import type { CoachContext } from '../src/lib/coach/types';
import { toStoredGame } from '../src/lib/import/games';
import { CLOCK_GAME } from './fixtures';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('intent detection', () => {
  it.each([
    ['Why was this move a blunder?', 'why-mistake'],
    ['What should I have done instead?', 'what-instead'],
    ['Why did I lose this endgame?', 'lost-endgame'],
    ["Explain this position like I'm a beginner.", 'explain-position'],
    ['What weaknesses keep appearing in my games?', 'weaknesses'],
    ['Give me a training plan based on my mistakes.', 'training-plan'],
    ['Quiz me on tactics.', 'quiz'],
    ['Help me understand positional chess.', 'lesson'],
    ['Teach me how to attack a castled king.', 'lesson'],
    ["Why does my opponent's move work?", 'opponent-move'],
  ])('%s → %s', (text, intent) => {
    expect(detectIntent(text)).toBe(intent);
  });
});

async function analysedClockGame() {
  const game = toStoredGame(parseGame(CLOCK_GAME), 'pgn', { aliases: ['alice'] });
  const evaluate: Evaluator = async (fen) => {
    const black = fen.split(' ')[1] === 'b';
    const mateNext = fen.startsWith('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2');
    return toPositionEval(fen, {
      depth: 12,
      bestMove: mateNext ? 'd8h4' : black ? 'e7e5' : 'e2e4',
      lines: [{ multipv: 1, depth: 12, ...(mateNext ? { mate: 1 } : { cp: black ? 30 : -30 }), pv: [mateNext ? 'd8h4' : black ? 'e7e5' : 'e2e4'] }],
    });
  };
  const analysis = await analyzeGame(game, { depth: 12, evaluate });
  return { game, analysis };
}

describe('offline coach', () => {
  it('explains the selected blunder with engine facts, never inventing moves', async () => {
    const { game, analysis } = await analysedClockGame();
    const ctx: CoachContext = { level: 'intermediate', game, analysis, ply: 3, fen: game.plies[2].fenAfter, engineAllowed: true };
    const r = respond('Why was this move a blunder?', ctx);
    const engine = r.blocks.find((b) => b.kind === 'engine');
    expect(engine && 'lines' in engine && engine.lines.join(' ')).toMatch(/Blunder/);
    const text = JSON.stringify(r.blocks);
    expect(text).toContain('Qh4');
  });

  it('refuses move-specific help while the fair-play gate is closed', async () => {
    const { game, analysis } = await analysedClockGame();
    const r = respond('Why was this move a blunder?', { level: 'beginner', game, analysis, ply: 3, engineAllowed: false, lockReason: 'Lichess reports you are in a game.' });
    expect(r.blocks[0].kind).toBe('warning');
    expect(JSON.stringify(r.blocks)).not.toContain('Qh4');
  });

  it('asks for more data instead of guessing weaknesses', () => {
    const r = respond('What weaknesses keep appearing in my games?', { level: 'advanced', engineAllowed: true });
    expect(JSON.stringify(r.blocks)).toMatch(/at least 5 analyzed games/);
  });

  it('starts quizzes and lessons through actions', () => {
    expect(respond('Quiz me on tactics', { level: 'beginner', engineAllowed: true }).actions?.[0].type).toBe('start-quiz');
    expect(respond('Teach me how to attack a castled king', { level: 'beginner', engineAllowed: true }).actions?.[0]).toEqual({ type: 'start-lesson', lessonId: 'attack-castled-king' });
  });

  it('describes positions from board facts', () => {
    const f = analyzeFeatures(START, 1);
    expect(f.materialBalance).toBe(0);
    expect(f.w.undevelopedMinors).toBe(4);
    expect(describeFeatures(f, 'beginner').join(' ')).toMatch(/Material is level/);
  });
});

describe('AI output verification', () => {
  it('extracts SAN-like tokens', () => {
    expect(extractSanMentions('Play Nf3 and then O-O, not Qxh7+.')).toEqual(['Nf3', 'O-O', 'Qxh7']);
  });

  it('flags moves that are neither legal nor in the engine lines', () => {
    const flagged = unverifiedMoves('You could play Nf3, or the engine line Qh5. Bb5 is also fine.', START, []);
    expect(flagged).toEqual(['Qh5', 'Bb5']);
    expect(unverifiedMoves('The engine shows Qh5 here.', START, ['Qh5'])).toEqual([]);
    // Bare squares in prose are not treated as moves.
    expect(unverifiedMoves('Your knight on f3 controls e5.', START, [])).toEqual([]);
  });

  it('passes only engine facts and a fair-play notice to the model', async () => {
    const { game, analysis } = await analysedClockGame();
    const ctx = buildContext({ level: 'expert', game, analysis, ply: 3, fen: game.plies[2].fenAfter, engineAllowed: true });
    expect(ctx).toContain('ENGINE FACTS');
    expect(ctx).toContain('This game is finished');
    const locked = buildContext({ level: 'expert', game, analysis, ply: 3, engineAllowed: false });
    expect(locked).toContain('unavailable');
    expect(locked).not.toContain('ENGINE FACTS (');
  });
});
