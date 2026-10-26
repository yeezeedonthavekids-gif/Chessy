import { describe, expect, it } from 'vitest';
import { computeStats, weeklyPlan } from '../src/lib/stats/aggregate';
import type { StoredGame } from '../src/lib/chess/types';
import type { GameAnalysis, MoveAnalysis } from '../src/lib/analysis/types';

function game(id: string, userColor: 'w' | 'b', result: StoredGame['result'], opening = 'Italian Game'): StoredGame {
  return { id, userColor, result, openingName: opening, playedAt: Number(id.slice(1)), headers: {}, plies: [], finished: true, pgn: '', startFen: '', source: 'pgn', white: 'a', black: 'b', importedAt: 0 } as StoredGame;
}

function move(ply: number, color: 'w' | 'b', classification: MoveAnalysis['classification'], motifs: MoveAnalysis['motifs'] = [], extra: Partial<MoveAnalysis> = {}): MoveAnalysis {
  return { ply, color, san: 'e4', uci: 'e2e4', phase: 'middlegame', wcBefore: 0, wcAfter: 0, wcLoss: 0, cpLoss: classification === 'blunder' ? 300 : 0, accuracy: 80, classification, bestMoveUci: null, bestMoveSan: 'Nf3', bestLineSan: [], replyLineSan: [], motifs, ...extra };
}

function analysis(gameId: string, moves: MoveAnalysis[], acc: number): GameAnalysis {
  const counts = { book: 0, forced: 0, 'only-move': 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  const w = { ...counts };
  moves.filter((m) => m.color === 'w').forEach((m) => w[m.classification]++);
  return { gameId, depth: 10, engine: 'sf', createdAt: 0, positions: [], moves, white: { accuracy: acc, acpl: 40, counts: w }, black: { accuracy: 90, acpl: 20, counts } };
}

describe('performance analytics', () => {
  it('computes results by colour and opening', () => {
    const games = [game('g1', 'w', '1-0'), game('g2', 'w', '0-1'), game('g3', 'b', '1/2-1/2', 'Sicilian'), game('g4', 'b', '0-1', 'Sicilian')];
    const s = computeStats(games, []);
    expect(s.results).toEqual({ win: 2, draw: 1, loss: 1 });
    expect(s.asWhite).toEqual({ win: 1, draw: 0, loss: 1 });
    expect(s.asBlack).toEqual({ win: 1, draw: 1, loss: 0 });
    expect(s.openings.map((o) => [o.name, o.games])).toEqual([['Italian Game', 2], ['Sicilian', 2]]);
    expect(s.accuracy).toBeUndefined();
    expect(s.sufficient).toBe(false);
  });

  it('ignores games where the user colour is unknown', () => {
    const g = { ...game('g1', 'w', '1-0'), userColor: null };
    expect(computeStats([g], []).knownColorGames).toBe(0);
  });

  it('finds recurring weaknesses only with enough analysed games, with examples', () => {
    const games = ['g1', 'g2', 'g3', 'g4', 'g5'].map((id) => game(id, 'w', '0-1'));
    const analyses = games.map((g, i) =>
      analysis(g.id, [move(10, 'w', 'blunder', ['hung-piece']), move(12, 'w', i < 2 ? 'mistake' : 'good', i < 2 ? ['time-pressure'] : [], { clock: 10 })], 70 + i),
    );
    const s = computeStats(games, analyses);
    expect(s.sufficient).toBe(true);
    expect(s.weaknesses[0].motif).toBe('hung-piece');
    expect(s.weaknesses[0].gamesAffected).toBe(5);
    expect(s.weaknesses[0].examples).toHaveLength(3);
    expect(s.weaknesses.map((w) => w.motif)).toContain('time-pressure');
    expect(s.ratePerGame?.blunders).toBe(1);
    expect(s.accuracy).toBe(72);
    expect(s.time?.errorsUnderPressure).toBe(2);
    expect(s.perGame.map((p) => p.gameId)).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
  });

  it('builds a seven-day plan', () => {
    const plan = weeklyPlan(computeStats([], []));
    expect(plan).toHaveLength(7);
    expect(plan.every((d) => d.tasks.length > 0)).toBe(true);
  });
});
