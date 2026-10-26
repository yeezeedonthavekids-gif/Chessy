import type { SkillLevel } from '../../state/settings';
import type { StoredGame } from '../chess/types';
import type { GameAnalysis } from '../analysis/types';
import type { PlayerStats } from '../stats/aggregate';

/**
 * A coach reply is a list of blocks. Each block declares where its content
 * came from so the UI can label it: verified engine output, Chessy's
 * rule-based coaching text, a pattern heuristic, or an external AI model.
 */
export type CoachBlock =
  | { kind: 'text'; source: 'coach' | 'ai'; text: string; bullets?: string[] }
  | { kind: 'engine'; title: string; lines: string[]; note?: string }
  | { kind: 'heuristic'; text: string; bullets?: string[] }
  | { kind: 'board'; fen: string; caption?: string; arrows?: [string, string][] }
  | { kind: 'warning'; text: string };

export type CoachAction =
  | { type: 'start-quiz'; theme?: string }
  | { type: 'start-lesson'; lessonId: string }
  | { type: 'open-game'; gameId: string; ply?: number };

export interface CoachReply {
  blocks: CoachBlock[];
  actions?: CoachAction[];
  suggestions?: string[];
}

export interface CoachContext {
  level: SkillLevel;
  game?: StoredGame;
  analysis?: GameAnalysis;
  /** Selected ply (1-based) in the game, if any. */
  ply?: number;
  /** Position the user is looking at. */
  fen?: string;
  stats?: PlayerStats;
  /** False while the fair-play gate blocks engine content. */
  engineAllowed: boolean;
  lockReason?: string;
}
