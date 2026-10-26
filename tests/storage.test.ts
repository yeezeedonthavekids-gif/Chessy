import { describe, expect, it } from 'vitest';
import { deleteEverything, exportAll, getCachedEval, listGames, putCachedEval, putGames, deleteGame, putAnalysis, getAnalysis } from '../src/lib/storage/db';
import { parseGame } from '../src/lib/chess/pgn';
import { toStoredGame } from '../src/lib/import/games';
import { OPERA_GAME } from './fixtures';

describe('IndexedDB storage', () => {
  it('stores, lists and deletes games with their analysis', async () => {
    await deleteEverything();
    const g = toStoredGame(parseGame(OPERA_GAME), 'pgn', {});
    await putGames([g]);
    await putAnalysis({ gameId: g.id } as never);
    expect((await listGames()).map((x) => x.id)).toEqual([g.id]);
    await deleteGame(g.id);
    expect(await listGames()).toEqual([]);
    expect(await getAnalysis(g.id)).toBeUndefined();
  });

  it('caches evaluations by position, depth and MultiPV (ignoring move counters)', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    await putCachedEval({ fen, depth: 12, cp: 30, lines: [], bestMove: 'e2e4' }, 12, 1);
    expect((await getCachedEval(fen.replace(' 0 1', ' 4 9'), 12, 1))?.cp).toBe(30);
    expect(await getCachedEval(fen, 14, 1)).toBeUndefined();
  });

  it('exports everything without the API key', async () => {
    const data = await exportAll();
    expect(data.format).toBe('chessy-export');
    expect(JSON.stringify(data)).not.toMatch(/apiKey|aiKey/);
  });
});

describe('data import', () => {
  it('restores a Chessy export and rejects other files', async () => {
    const { importAll } = await import('../src/lib/storage/db');
    await deleteEverything();
    const g = toStoredGame(parseGame(OPERA_GAME), 'pgn', {});
    await putGames([g]);
    const backup = JSON.stringify(await exportAll());
    await deleteEverything();
    const counts = await importAll(backup);
    expect(counts.games).toBe(1);
    expect((await listGames()).map((x) => x.id)).toEqual([g.id]);
    await expect(importAll('{"hello":1}')).rejects.toThrow(/not a Chessy export/);
    await expect(importAll('nope')).rejects.toThrow(/not valid JSON/);
  });
});
