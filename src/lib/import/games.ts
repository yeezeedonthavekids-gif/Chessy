import type { Color, GameSource, ParsedGame, StoredGame } from '../chess/types';

export interface Usernames {
  chesscom?: string;
  lichess?: string;
  /** Extra names the user plays under in OTB / other PGNs. */
  aliases?: string[];
}

/** FNV-1a hash, used to give identical PGN imports the same id. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function parseDate(headers: Record<string, string>): { date?: string; playedAt?: number } {
  const raw = headers.UTCDate ?? headers.Date;
  if (!raw || raw.includes('?')) return { date: raw };
  const [y, m, d] = raw.split('.').map(Number);
  if (!y || !m || !d) return { date: raw };
  const time = headers.UTCTime ?? headers.StartTime ?? '00:00:00';
  const [hh, mm, ss] = time.split(':').map(Number);
  return { date: raw, playedAt: Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0) };
}

function openingFromEcoUrl(url: string | undefined): string | undefined {
  // Chess.com PGNs carry e.g. [ECOUrl "https://www.chess.com/openings/Sicilian-Defense-Najdorf..."]
  const slug = url?.split('/openings/')[1];
  if (!slug) return undefined;
  return decodeURIComponent(slug)
    .replace(/-\d.*$/, '')
    .replace(/-/g, ' ')
    .trim();
}

export function detectUserColor(headers: Record<string, string>, names: Usernames): Color | null {
  const candidates = [names.chesscom, names.lichess, ...(names.aliases ?? [])]
    .filter((n): n is string => !!n && n.trim().length > 0)
    .map((n) => n.trim().toLowerCase());
  if (!candidates.length) return null;
  if (candidates.includes((headers.White ?? '').toLowerCase())) return 'w';
  if (candidates.includes((headers.Black ?? '').toLowerCase())) return 'b';
  return null;
}

export function toStoredGame(
  parsed: ParsedGame,
  source: GameSource,
  names: Usernames,
  extra: { externalId?: string; url?: string; userColor?: Color | null } = {},
): StoredGame {
  const h = parsed.headers;
  const { date, playedAt } = parseDate(h);
  const site = h.Site ?? '';
  const url = extra.url ?? (/^https?:\/\//.test(h.Link ?? site) ? h.Link ?? site : undefined);
  const externalId = extra.externalId ?? (url ? url : undefined);
  const elo = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const now = Date.now();
  return {
    ...parsed,
    id: `g_${hashString(source + (externalId ?? parsed.pgn))}`,
    source,
    white: h.White ?? 'White',
    black: h.Black ?? 'Black',
    whiteElo: elo(h.WhiteElo),
    blackElo: elo(h.BlackElo),
    date,
    playedAt: playedAt ?? now,
    timeControl: h.TimeControl,
    eco: h.ECO,
    openingName: h.Opening ?? openingFromEcoUrl(h.ECOUrl),
    userColor: extra.userColor !== undefined ? extra.userColor : detectUserColor(h, names),
    externalId,
    url,
    importedAt: now,
  };
}

export function userResult(game: Pick<StoredGame, 'result' | 'userColor'>): 'win' | 'draw' | 'loss' | null {
  if (!game.userColor || game.result === '*') return null;
  if (game.result === '1/2-1/2') return 'draw';
  const whiteWon = game.result === '1-0';
  return (game.userColor === 'w') === whiteWon ? 'win' : 'loss';
}
