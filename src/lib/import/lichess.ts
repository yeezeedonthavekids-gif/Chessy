import { parsePgnCollection } from '../chess/pgn';
import type { StoredGame } from '../chess/types';
import { toStoredGame, type Usernames } from './games';
import { ImportError, politeGet, type FetchFn } from './http';

/**
 * Lichess public API. Game export only returns finished games by default
 * (`finished=true`, `ongoing=false`). Docs: https://lichess.org/api#tag/Games
 */
const API = 'https://lichess.org/api';

function cleanUsername(u: string) {
  const name = u.trim();
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(name)) throw new ImportError('That does not look like a valid Lichess username.');
  return name;
}

export interface LichessImportOptions {
  username: string;
  max: number;
  names: Usernames;
  signal?: AbortSignal;
  fetchFn?: FetchFn;
  /** Optional personal API token (only needed for higher rate limits; never required). */
  token?: string;
}

export async function importLichessGames(opts: LichessImportOptions): Promise<StoredGame[]> {
  const username = cleanUsername(opts.username);
  const params = new URLSearchParams({
    max: String(Math.max(1, Math.min(300, opts.max))),
    clocks: 'true',
    opening: 'true',
    finished: 'true',
    ongoing: 'false',
    evals: 'false',
  });
  const headers: Record<string, string> = { Accept: 'application/x-chess-pgn' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await politeGet(`${API}/games/user/${encodeURIComponent(username)}?${params}`, {
    headers,
    signal: opts.signal,
    fetchFn: opts.fetchFn,
  });
  if (res.status === 404) throw new ImportError(`Lichess user "${username}" was not found.`, 404);
  if (!res.ok) throw new ImportError(`Lichess returned an error (${res.status}).`, res.status);
  const text = await res.text();
  if (!text.trim()) return [];
  const { games } = parsePgnCollection(text);
  return games
    .filter((g) => (g.headers.Variant ?? 'Standard') === 'Standard' || g.headers.Variant === 'From Position')
    .map((g) => {
      const site = g.headers.Site ?? '';
      const lower = username.toLowerCase();
      const userColor =
        (g.headers.White ?? '').toLowerCase() === lower ? 'w' : (g.headers.Black ?? '').toLowerCase() === lower ? 'b' : null;
      return toStoredGame(g, 'lichess', opts.names, { externalId: site || undefined, url: site || undefined, userColor });
    });
}

/** Uses the public users/status endpoint to learn whether the user is currently playing. */
export async function fetchLichessPlaying(username: string, fetchFn?: FetchFn, signal?: AbortSignal): Promise<boolean> {
  const name = cleanUsername(username);
  const res = await politeGet(`${API}/users/status?ids=${encodeURIComponent(name)}`, { fetchFn, signal });
  if (!res.ok) throw new ImportError(`Lichess status check failed (${res.status}).`, res.status);
  const list = (await res.json()) as { id: string; playing?: boolean | { id: string } }[];
  const me = list.find((u) => u.id === name.toLowerCase());
  return !!me?.playing;
}
