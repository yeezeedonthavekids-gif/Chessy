import { Chess } from 'chess.js';
import { START_FEN, type GameResult, type ParsedGame, type Ply } from './types';

export class PgnError extends Error {
  constructor(message: string, readonly gameIndex?: number) {
    super(message);
    this.name = 'PgnError';
  }
}

const RESULTS: GameResult[] = ['1-0', '0-1', '1/2-1/2', '*'];
const MAX_PGN_BYTES = 20 * 1024 * 1024;

/**
 * Splits a multi-game PGN file into individual game strings. A new game begins
 * at a tag-pair line that follows movetext.
 */
export function splitPgn(text: string): string[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const games: string[] = [];
  let current: string[] = [];
  let seenMoves = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isTag = /^\[[A-Za-z0-9_]+\s+".*"\]$/.test(trimmed);
    if (isTag && seenMoves) {
      games.push(current.join('\n').trim());
      current = [];
      seenMoves = false;
    }
    if (!isTag && trimmed.length > 0) seenMoves = true;
    current.push(line);
  }
  const last = current.join('\n').trim();
  if (last) games.push(last);
  return games.filter((g) => g.length > 0);
}

/** Parses "[%clk 0:03:21.4]" style clock annotations into seconds. */
export function parseClock(comment: string | undefined): number | undefined {
  if (!comment) return undefined;
  const m = comment.match(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function cleanComment(comment: string): string | undefined {
  const cleaned = comment.replace(/\[%[^\]]*\]/g, '').trim();
  return cleaned.length ? cleaned : undefined;
}

function moveToUci(m: { from: string; to: string; promotion?: string }): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`;
}

/** Parses a single-game PGN into plies. Throws PgnError for malformed input. */
export function parseGame(pgn: string): ParsedGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch (e) {
    throw new PgnError(`Could not read PGN: ${(e as Error).message}`);
  }
  const headers = Object.fromEntries(
    Object.entries(chess.getHeaders()).filter(([, v]) => v !== null && v !== undefined),
  ) as Record<string, string>;
  const verbose = chess.history({ verbose: true });
  const commentByFen = new Map(chess.getComments().map((c) => [c.fen, c.comment]));
  const startFen = headers.FEN && headers.SetUp !== '0' ? headers.FEN : verbose[0]?.before ?? START_FEN;

  const plies: Ply[] = verbose.map((m, i) => {
    const comment = commentByFen.get(m.after);
    const fullmove = Number(m.before.split(' ')[5]) || 1;
    return {
      ply: i + 1,
      moveNumber: fullmove,
      color: m.color,
      san: m.san,
      uci: moveToUci(m),
      fenBefore: m.before,
      fenAfter: m.after,
      clock: parseClock(comment),
      comment: comment ? cleanComment(comment) : undefined,
    };
  });

  const headerResult = (headers.Result ?? '*') as GameResult;
  const result: GameResult = RESULTS.includes(headerResult) ? headerResult : '*';
  const terminal = chess.isGameOver();
  return {
    headers,
    startFen,
    plies,
    result: result === '*' && terminal ? terminalResult(chess) : result,
    finished: result !== '*' || terminal,
    pgn: chess.pgn(),
  };
}

function terminalResult(chess: Chess): GameResult {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0';
  return '1/2-1/2';
}

export interface PgnImportResult {
  games: ParsedGame[];
  errors: { index: number; message: string }[];
}

/** Parses every game in a (possibly multi-game) PGN. Malformed games are reported, not thrown. */
export function parsePgnCollection(text: string): PgnImportResult {
  if (text.length > MAX_PGN_BYTES) {
    throw new PgnError('PGN file is larger than 20 MB. Split it into smaller files.');
  }
  const chunks = splitPgn(text);
  if (chunks.length === 0) throw new PgnError('No games found. Paste PGN text or choose a .pgn file.');
  const games: ParsedGame[] = [];
  const errors: { index: number; message: string }[] = [];
  chunks.forEach((chunk, index) => {
    try {
      const game = parseGame(chunk);
      if (game.plies.length === 0) {
        errors.push({ index, message: 'Game contains no moves.' });
        return;
      }
      games.push(game);
    } catch (e) {
      errors.push({ index, message: (e as Error).message });
    }
  });
  return { games, errors };
}

/** Converts a UCI move list to SAN starting from `fen`. Stops at the first illegal move. */
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciMoves) {
    try {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Formats a SAN line with move numbers, e.g. "12...Nf6 13. Bg5". */
export function formatLine(fen: string, sans: string[]): string {
  const parts = fen.split(' ');
  let moveNo = Number(parts[5]) || 1;
  let color = parts[1];
  const out: string[] = [];
  sans.forEach((san, i) => {
    if (color === 'w') out.push(`${moveNo}. ${san}`);
    else out.push(i === 0 ? `${moveNo}...${san}` : san);
    if (color === 'b') moveNo++;
    color = color === 'w' ? 'b' : 'w';
  });
  return out.join(' ');
}

/** FEN without the move counters, for transposition-aware comparisons. */
export function epd(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}
