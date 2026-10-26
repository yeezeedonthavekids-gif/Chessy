import type { Color } from '../chess/types';
import type { EngineLine } from '../engine/uci';

/** A position evaluation, always stored from White's point of view. */
export interface PositionEval {
  fen: string;
  depth: number;
  /** White-POV centipawns (absent when mate is set). */
  cp?: number;
  /** White-POV mate distance: positive = White mates. 0 means the side to move is already mated. */
  mate?: number;
  /** Top engine lines (side-to-move POV scores, UCI PVs) as reported by Stockfish. */
  lines: EngineLine[];
  bestMove: string | null;
  /** True for checkmate/stalemate/draw positions evaluated by rules, not the engine. */
  terminal?: 'checkmate' | 'stalemate' | 'draw';
}

export type MoveClass =
  | 'book'
  | 'forced'
  | 'only-move'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export type Motif =
  | 'missed-mate'
  | 'allowed-mate'
  | 'hung-piece'
  | 'missed-material'
  | 'missed-fork'
  | 'allowed-fork'
  | 'missed-win'
  | 'threw-advantage'
  | 'opening-principle'
  | 'endgame-technique'
  | 'time-pressure';

export type Phase = 'opening' | 'middlegame' | 'endgame';

export interface MoveAnalysis {
  ply: number;
  color: Color;
  san: string;
  uci: string;
  phase: Phase;
  /** Mover-POV winning chances in [-1, 1] before and after the move. */
  wcBefore: number;
  wcAfter: number;
  /** Loss of winning chances caused by the move (>= 0). */
  wcLoss: number;
  /** Mover-POV centipawn loss, clamped to [0, 1000]. */
  cpLoss: number;
  /** 0-100 move accuracy derived from winning-percentage loss (Lichess formula). */
  accuracy: number;
  classification: MoveClass;
  bestMoveUci: string | null;
  bestMoveSan: string | null;
  /** Engine's best continuation from the position before the move, in SAN. */
  bestLineSan: string[];
  /** Engine's reply line after the played move, in SAN. */
  replyLineSan: string[];
  motifs: Motif[];
  clock?: number;
  /** Seconds spent on this move, if clock data allows. */
  timeSpent?: number;
}

export interface PlayerSummary {
  accuracy: number;
  acpl: number;
  counts: Record<MoveClass, number>;
}

export interface GameAnalysis {
  gameId: string;
  depth: number;
  engine: string;
  createdAt: number;
  positions: PositionEval[];
  moves: MoveAnalysis[];
  white: PlayerSummary;
  black: PlayerSummary;
}
