import { parseGame } from '../chess/pgn';
import { epd } from '../chess/pgn';
import type { StoredGame } from '../chess/types';
import { toStoredGame, type Usernames } from './games';
import { ImportError, politeGet, type FetchFn } from './http';

/**
 * Chess.com Published-Data API (read-only, public data, no authentication).
 * Docs: https://www.chess.com/news/view/published-data-api
 * Only finished games appear in the monthly archives.
 */
const API = 'https://api.chess.com/pub';

interface ArchiveGame {
  url: string;
  pgn?: string;
  rules: string;
  end_time?: number;
  white: { username: string; rating?: number; result: string };
  black: { username: string; rating?: number; result: string };
}

export interface ChessComImportOptions {
  username: string;
  /** Maximum number of games to import (most recent first). */
  max: number;
  names: Usernames;
  signal?: AbortSignal;
  fetchFn?: FetchFn;
  onProgress?: (message: string) => void;
}

function cleanUsername(u: string) {
  const name = u.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,50}$/.test(name)) throw new ImportError('That does not look like a valid Chess.com username.');
  return name;
}

export async function importChessComGames(opts: ChessComImportOptions): Promise<StoredGame[]> {
  const username = cleanUsername(opts.username);
  const res = await politeGet(`${API}/player/${username}/games/archives`, {
    signal: opts.signal,
    fetchFn: opts.fetchFn,
  });
  if (res.status === 404) throw new ImportError(`Chess.com user "${username}" was not found.`, 404);
  if (!res.ok) throw new ImportError(`Chess.com returned an error (${res.status}).`, res.status);
  const { archives } = (await res.json()) as { archives: string[] };
  const out: StoredGame[] = [];
  // Walk monthly archives newest-first, sequentially (Chess.com asks for serial requests).
  for (const archiveUrl of [...archives].reverse()) {
    if (out.length >= opts.max) break;
    opts.onProgress?.(`Reading ${archiveUrl.split('/').slice(-2).join('/')}…`);
    const r = await politeGet(archiveUrl, { signal: opts.signal, fetchFn: opts.fetchFn });
    if (!r.ok) throw new ImportError(`Chess.com archive request failed (${r.status}).`, r.status);
    const { games } = (await r.json()) as { games: ArchiveGame[] };
    const sorted = [...games].sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
    for (const g of sorted) {
      if (out.length >= opts.max) break;
      if (g.rules !== 'chess' || !g.pgn) continue; // skip variants
      try {
        const parsed = parseGame(g.pgn);
        if (!parsed.plies.length) continue;
        const userColor =
          g.white.username.toLowerCase() === username ? 'w' : g.black.username.toLowerCase() === username ? 'b' : null;
        out.push(toStoredGame(parsed, 'chesscom', opts.names, { externalId: g.url, url: g.url, userColor }));
      } catch {
        /* skip malformed game */
      }
    }
  }
  return out;
}

/**
 * Fetches the positions of the user's ongoing Chess.com *daily* games so the
 * fair-play gate can refuse to analyse them. Live (real-time) games are not
 * exposed by the public API; see README "Fair play".
 */
export async function fetchChessComOngoingPositions(
  username: string,
  fetchFn?: FetchFn,
  signal?: AbortSignal,
): Promise<string[]> {
  const name = cleanUsername(username);
  const res = await politeGet(`${API}/player/${name}/games`, { fetchFn, signal });
  if (!res.ok) throw new ImportError(`Chess.com status check failed (${res.status}).`, res.status);
  const { games } = (await res.json()) as { games: { fen?: string; pgn?: string }[] };
  const positions = new Set<string>();
  for (const g of games ?? []) {
    if (g.fen) positions.add(epd(g.fen));
    if (g.pgn) {
      try {
        const parsed = parseGame(g.pgn);
        parsed.plies.forEach((p) => {
          positions.add(epd(p.fenBefore));
          positions.add(epd(p.fenAfter));
        });
      } catch {
        /* position list from fen is enough */
      }
    }
  }
  return [...positions];
}
