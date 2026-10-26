import { describe, expect, it, vi } from 'vitest';
import { fetchChessComOngoingPositions, importChessComGames } from '../src/lib/import/chesscom';
import { detectUserColor, toStoredGame, userResult } from '../src/lib/import/games';
import { fetchLichessPlaying, importLichessGames } from '../src/lib/import/lichess';
import { parseGame } from '../src/lib/chess/pgn';
import { CLOCK_GAME, OPERA_GAME } from './fixtures';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('stored games', () => {
  it('detects the user colour from usernames and aliases (case-insensitive)', () => {
    expect(detectUserColor({ White: 'Alice', Black: 'bob' }, { chesscom: 'alice' })).toBe('w');
    expect(detectUserColor({ White: 'x', Black: 'Bob' }, { aliases: ['BOB'] })).toBe('b');
    expect(detectUserColor({ White: 'x', Black: 'y' }, { lichess: 'z' })).toBeNull();
  });

  it('derives result, date and a stable id', () => {
    const g = toStoredGame(parseGame(CLOCK_GAME), 'pgn', { chesscom: 'bob' });
    expect(g.userColor).toBe('b');
    expect(userResult(g)).toBe('win');
    expect(g.playedAt).toBe(Date.UTC(2024, 2, 1, 12, 30, 0));
    expect(toStoredGame(parseGame(CLOCK_GAME), 'pgn', {}).id).toBe(g.id);
  });
});

describe('Chess.com Published-Data API client', () => {
  it('walks archives newest-first, skips variants and limits the count', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/games/archives')) return json({ archives: ['https://api.chess.com/pub/player/bob/games/2024/02', 'https://api.chess.com/pub/player/bob/games/2024/03'] });
      if (url.endsWith('2024/03'))
        return json({
          games: [
            { url: 'https://www.chess.com/game/live/1', pgn: CLOCK_GAME, rules: 'chess', end_time: 2, white: { username: 'alice', result: 'checkmated' }, black: { username: 'Bob', result: 'win' } },
            { url: 'https://www.chess.com/game/live/2', pgn: CLOCK_GAME, rules: 'chess960', end_time: 3, white: { username: 'alice', result: 'x' }, black: { username: 'bob', result: 'x' } },
          ],
        });
      return json({ games: [{ url: 'https://www.chess.com/game/live/0', pgn: OPERA_GAME, rules: 'chess', end_time: 1, white: { username: 'bob', result: 'win' }, black: { username: 'z', result: 'x' } }] });
    });
    const games = await importChessComGames({ username: 'Bob', max: 5, names: {}, fetchFn: fetchFn as never });
    expect(games.map((g) => g.externalId)).toEqual(['https://www.chess.com/game/live/1', 'https://www.chess.com/game/live/0']);
    expect(games[0].userColor).toBe('b');
    expect(games[1].userColor).toBe('w');
    expect(fetchFn.mock.calls[1][0]).toContain('2024/03');
  });

  it('reports unknown users clearly', async () => {
    const fetchFn = vi.fn(async () => json({ message: 'not found' }, 404));
    await expect(importChessComGames({ username: 'nobody', max: 5, names: {}, fetchFn: fetchFn as never })).rejects.toThrow(/not found/);
  });

  it('rejects invalid usernames before calling the API', async () => {
    const fetchFn = vi.fn();
    await expect(importChessComGames({ username: '../etc', max: 5, names: {}, fetchFn: fetchFn as never })).rejects.toThrow(/valid/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('collects positions from ongoing daily games for the fair-play gate', async () => {
    const fetchFn = vi.fn(async () => json({ games: [{ fen: '8/8/8/8/8/8/8/K6k w - - 0 40', pgn: '[Result "*"]\n\n1. e4 e5 *' }] }));
    const positions = await fetchChessComOngoingPositions('bob', fetchFn as never);
    expect(positions).toContain('8/8/8/8/8/8/8/K6k w - -');
    expect(positions.length).toBeGreaterThan(2);
  });
});

describe('Lichess API client', () => {
  it('requests finished games as PGN with clocks and openings', async () => {
    const fetchFn = vi.fn(async () => new Response(`${OPERA_GAME}\n\n${CLOCK_GAME}`, { status: 200 }));
    const games = await importLichessGames({ username: 'alice', max: 10, names: {}, fetchFn: fetchFn as never });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/games/user/alice');
    expect(url).toContain('finished=true');
    expect(url).toContain('ongoing=false');
    expect(url).toContain('clocks=true');
    expect((init.headers as Record<string, string>).Accept).toBe('application/x-chess-pgn');
    expect(games).toHaveLength(2);
    expect(games[1].userColor).toBe('w');
  });

  it('reads the playing flag from the public status endpoint', async () => {
    const fetchFn = vi.fn(async () => json([{ id: 'alice', name: 'Alice', online: true, playing: true }]));
    expect(await fetchLichessPlaying('Alice', fetchFn as never)).toBe(true);
    const idle = vi.fn(async () => json([{ id: 'alice', name: 'Alice', online: true }]));
    expect(await fetchLichessPlaying('alice', idle as never)).toBe(false);
  });

  it('retries once after HTTP 429 using Retry-After', async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetchFn = vi.fn(async () => (n++ === 0 ? new Response('', { status: 429, headers: { 'Retry-After': '1' } }) : json([{ id: 'alice' }])));
    const p = fetchLichessPlaying('alice', fetchFn as never);
    await vi.advanceTimersByTimeAsync(1100);
    expect(await p).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
