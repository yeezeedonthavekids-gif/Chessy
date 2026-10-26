import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { TRAPS } from '../src/data/traps';
import { LESSONS } from '../src/lib/coach/lessons';
import { continuations, fensForMoves, identifyOpening, loadOpenings } from '../src/lib/openings/explorer';
import { parseRepertoire, repertoireToPgn } from '../src/lib/openings/repertoire';

describe('opening data', () => {
  it('every trap line is legal and its mistake index is in range', () => {
    for (const t of TRAPS) {
      const c = new Chess();
      for (const m of t.moves) expect(() => c.move(m), `${t.id}: ${m}`).not.toThrow();
      expect(t.mistakeAt).toBeLessThan(t.moves.length);
      // The trap's winner makes the final move.
      expect((t.moves.length - 1) % 2 === 0 ? 'w' : 'b').toBe(t.winner);
    }
  });

  it('every lesson FEN is a valid position', () => {
    for (const l of LESSONS) for (const s of l.steps) if (s.fen) expect(() => new Chess(s.fen)).not.toThrow();
    for (const l of LESSONS) for (const q of l.quiz) expect(q.answer).toBeLessThan(q.options.length);
  });

  it('identifies openings by position, including transpositions', async () => {
    const { byEpd, list } = await loadOpenings();
    expect(list.length).toBeGreaterThan(3000);
    const ruy = identifyOpening(byEpd, fensForMoves(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']));
    expect(ruy?.name).toMatch(/Ruy Lopez/);
    expect(ruy?.eco).toBe('C60');
    // 1.Nf3 d5 2.d4 reaches the same position as 1.d4 d5 2.Nf3
    const a = identifyOpening(byEpd, fensForMoves(['Nf3', 'd5', 'd4']));
    const b = identifyOpening(byEpd, fensForMoves(['d4', 'd5', 'Nf3']));
    expect(a?.epd).toBe(b?.epd);
  });

  it('lists known continuations', async () => {
    const { list } = await loadOpenings();
    const next = continuations(list, ['e4', 'e5', 'Nf3']).map((c) => c.san);
    expect(next).toContain('Nc6');
    expect(next).toContain('Nf6');
  });
});

describe('repertoire import/export', () => {
  const lines = [
    { id: '1', color: 'w' as const, name: 'Italian', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], notes: 'Aim for c3 and d4', createdAt: 0, updatedAt: 0 },
    { id: '2', color: 'b' as const, name: 'Caro-Kann', moves: ['e4', 'c6', 'd4', 'd5'], notes: '', createdAt: 0, updatedAt: 0 },
  ];

  it('round-trips through PGN', () => {
    const back = parseRepertoire(repertoireToPgn(lines));
    expect(back.map((l) => [l.name, l.color, l.moves.join(' ')])).toEqual([
      ['Italian', 'w', 'e4 e5 Nf3 Nc6 Bc4'],
      ['Caro-Kann', 'b', 'e4 c6 d4 d5'],
    ]);
    expect(back[0].notes).toBe('Aim for c3 and d4');
  });

  it('round-trips through JSON and drops illegal lines', () => {
    const json = JSON.stringify([...lines, { color: 'w', name: 'bad', moves: ['e5'] }]);
    const back = parseRepertoire(json);
    expect(back).toHaveLength(2);
  });
});
