export type Color = 'w' | 'b';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';
export type GameSource = 'pgn' | 'chesscom' | 'lichess';

/** One half-move of a game, with the positions on either side of it. */
export interface Ply {
  /** 1-based half-move index. */
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  /** Long algebraic move, e.g. "e2e4" or "e7e8q". */
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Remaining clock time in seconds after the move, if the PGN had [%clk]. */
  clock?: number;
  comment?: string;
}

export interface ParsedGame {
  headers: Record<string, string>;
  startFen: string;
  plies: Ply[];
  result: GameResult;
  /** Whether the game is verifiably over (decisive/drawn result or terminal position). */
  finished: boolean;
  /** Raw PGN as normalised by chess.js. */
  pgn: string;
}

export interface StoredGame extends ParsedGame {
  id: string;
  source: GameSource;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  date?: string;
  /** Unix ms timestamp used for sorting/trends (from headers when available). */
  playedAt: number;
  timeControl?: string;
  eco?: string;
  openingName?: string;
  /** Which colour the app's user played, when known. */
  userColor: Color | null;
  externalId?: string;
  url?: string;
  importedAt: number;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
