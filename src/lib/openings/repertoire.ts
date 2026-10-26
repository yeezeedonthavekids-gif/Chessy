import { Chess } from 'chess.js';
import { parsePgnCollection } from '../chess/pgn';
import { uid, type RepertoireLine } from '../storage/db';

/** Exports repertoire lines as a multi-game PGN (one game per line, notes as a comment). */
export function repertoireToPgn(lines: RepertoireLine[]): string {
  return lines
    .map((l) => {
      const c = new Chess();
      c.setHeader('Event', `Chessy repertoire: ${l.name}`);
      c.setHeader('Site', 'Chessy');
      c.setHeader('White', l.color === 'w' ? 'Repertoire' : '?');
      c.setHeader('Black', l.color === 'b' ? 'Repertoire' : '?');
      c.setHeader('Result', '*');
      c.setHeader('RepertoireColor', l.color === 'w' ? 'white' : 'black');
      for (const m of l.moves) c.move(m);
      if (l.notes) c.setComment(l.notes.replace(/[{}]/g, ''));
      return c.pgn();
    })
    .join('\n\n');
}

/** Imports repertoire lines from Chessy JSON or PGN. Invalid entries are skipped. */
export function parseRepertoire(text: string): RepertoireLine[] {
  const now = Date.now();
  const trimmed = text.trim();
  if (trimmed.startsWith('[') && trimmed.includes('"moves"')) {
    const arr = JSON.parse(trimmed) as Partial<RepertoireLine>[];
    return arr
      .filter((l) => Array.isArray(l.moves) && (l.color === 'w' || l.color === 'b'))
      .filter((l) => {
        const c = new Chess();
        try {
          l.moves!.forEach((m) => c.move(m));
          return true;
        } catch {
          return false;
        }
      })
      .map((l) => ({ id: uid('rep'), color: l.color!, name: l.name ?? 'Imported line', moves: l.moves!, notes: l.notes ?? '', createdAt: now, updatedAt: now }));
  }
  const { games } = parsePgnCollection(text);
  return games.map((g) => {
    const colorHeader = (g.headers.RepertoireColor ?? '').toLowerCase();
    const color: 'w' | 'b' = colorHeader === 'black' || g.headers.Black === 'Repertoire' ? 'b' : 'w';
    const name = (g.headers.Event ?? 'Imported line').replace(/^Chessy repertoire:\s*/, '');
    const lastComment = [...g.plies].reverse().find((p) => p.comment)?.comment ?? '';
    return { id: uid('rep'), color, name, moves: g.plies.map((p) => p.san), notes: lastComment, createdAt: now, updatedAt: now };
  });
}
