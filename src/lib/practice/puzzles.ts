import { Chess, type Square } from 'chess.js';
import data from '../../data/puzzles.json';
import { PIECE_NAME } from '../chess/position';
import type { Color, StoredGame } from '../chess/types';
import type { GameAnalysis, Motif } from '../analysis/types';

export interface Puzzle {
  id: string;
  kind: 'tactic' | 'drill';
  source: 'builtin' | 'own-game';
  title: string;
  fen: string;
  /** Solution in UCI: solver move, opponent reply, solver move, ... */
  moves: string[];
  themes: string[];
  /** Approximate difficulty on an Elo-like scale (hand-assigned for built-ins). */
  rating?: number;
  goal?: 'checkmate' | 'promote' | 'hold-draw';
  maxMoves?: number;
  tip?: string;
  solver: Color;
  /** For own-game puzzles: where it came from. */
  origin?: { gameId: string; ply: number; label: string; playedSan: string };
}

interface RawPuzzle {
  id: string;
  kind: 'tactic' | 'drill';
  title: string;
  fen: string;
  moves: string[];
  themes: string[];
  rating: number;
  goal?: string;
  maxMoves?: number;
  tip?: string;
}

export const VERIFIED_WITH: string = (data as { verifiedWith: string }).verifiedWith;

export const BUILTIN_PUZZLES: Puzzle[] = (data as { puzzles: RawPuzzle[] }).puzzles.map((p) => ({
  ...p,
  goal: p.goal as Puzzle['goal'],
  source: 'builtin',
  solver: p.fen.split(' ')[1] === 'b' ? 'b' : 'w',
}));

const MOTIF_THEME: Record<Motif, string> = {
  'missed-mate': 'mate',
  'allowed-mate': 'defence',
  'hung-piece': 'hanging-piece',
  'missed-material': 'capture',
  'missed-fork': 'fork',
  'allowed-fork': 'fork',
  'missed-win': 'conversion',
  'threw-advantage': 'conversion',
  'opening-principle': 'opening',
  'endgame-technique': 'endgame',
  'time-pressure': 'time',
};

/**
 * Turns the user's own mistakes into "find the best move" puzzles. Only
 * positions where the engine's top move is clearly better than the
 * alternatives (MultiPV gap) are used, so the puzzle has one answer.
 */
export function puzzlesFromAnalyses(games: StoredGame[], analyses: GameAnalysis[]): Puzzle[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const out: Puzzle[] = [];
  for (const a of analyses) {
    const g = byId.get(a.gameId);
    if (!g || !g.userColor) continue;
    for (const m of a.moves) {
      if (m.color !== g.userColor) continue;
      if (m.classification !== 'mistake' && m.classification !== 'blunder') continue;
      const pos = a.positions[m.ply - 1];
      if (!pos || !m.bestMoveUci || pos.lines.length < 2) continue;
      const toCh = (l: (typeof pos.lines)[number]) =>
        l.mate !== undefined ? (l.mate > 0 ? 1 : -1) : 2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, l.cp ?? 0)))) - 1;
      if (toCh(pos.lines[0]) - toCh(pos.lines[1]) < 0.25) continue;
      const opp = g.userColor === 'w' ? g.black : g.white;
      out.push({
        id: `own_${g.id}_${m.ply}`,
        kind: 'tactic',
        source: 'own-game',
        title: `Your game vs ${opp}`,
        fen: pos.fen,
        moves: [m.bestMoveUci],
        themes: [...new Set(m.motifs.map((x) => MOTIF_THEME[x]))],
        solver: m.color,
        origin: {
          gameId: g.id,
          ply: m.ply,
          label: `${g.white} – ${g.black}${g.date ? `, ${g.date}` : ''}`,
          playedSan: m.san,
        },
      });
    }
  }
  return out;
}

export type MoveVerdict = 'correct' | 'solved' | 'alternative-mate' | 'wrong';

/** Checks the solver's move at `step` (index into puzzle.moves). */
export function checkPuzzleMove(puzzle: Puzzle, step: number, fenBefore: string, uci: string): MoveVerdict {
  const expected = puzzle.moves[step];
  const isLast = step >= puzzle.moves.length - 1;
  if (uci === expected) return isLast ? 'solved' : 'correct';
  // Any checkmate is a full solution.
  const c = new Chess(fenBefore);
  try {
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (c.isCheckmate()) return 'alternative-mate';
  } catch {
    /* illegal */
  }
  return 'wrong';
}

export interface Hint {
  level: number;
  text: string;
  /** Squares to highlight on the board. */
  squares?: Square[];
}

const THEME_QUESTION: Record<string, string> = {
  'mate-in-1': 'Is there a check that leaves the king with no escape squares?',
  'mate-in-2': 'Look at every check — even ones that give up material. What happens after each forced reply?',
  'mate-in-3': 'The king looks safe, but a forcing sequence of checks exists. Which check opens lines?',
  'mate-in-4': 'Count the defenders around the king. A sacrifice can remove the key one.',
  'back-rank': 'The king is trapped behind its own pawns. Which rank is undefended?',
  fork: 'Can one of your pieces attack two valuable targets at once?',
  skewer: 'Two enemy pieces stand on the same line. What if you attack the front one?',
  'hanging-piece': 'Is any enemy piece attacked and not defended?',
  capture: 'Look at every capture. Which one wins material without a good recapture?',
  sacrifice: 'Sometimes the strongest move gives material away. What does a sacrifice open up?',
  'smothered-mate': 'The king is surrounded by its own pieces. Which piece can jump over them?',
  defence: 'What is your opponent threatening? Find the move that deals with it.',
  conversion: 'You are better here. Which move keeps — or increases — your advantage?',
  endgame: 'In the endgame the king is a strong piece. How should it help?',
  opening: 'Think about development, centre control and king safety.',
};

/** Progressive hints: question → piece → target square → full answer. */
export function puzzleHint(puzzle: Puzzle, step: number, fenBefore: string, level: number): Hint {
  const uci = puzzle.moves[step];
  const chess = new Chess(fenBefore);
  if (level <= 1) {
    const q =
      puzzle.themes.map((t) => THEME_QUESTION[t]).find(Boolean) ??
      'Start with forcing moves: checks, captures and threats. What does your opponent want to do?';
    return { level: 1, text: q };
  }
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const piece = chess.get(from);
  if (level === 2) {
    return { level: 2, text: `Look at your ${piece ? PIECE_NAME[piece.type] : 'piece'} on ${from}.`, squares: [from] };
  }
  if (level === 3) {
    return { level: 3, text: `It goes to ${to}.`, squares: [from, to] };
  }
  const move = chess.move({ from, to, promotion: uci[4] });
  return { level: 4, text: `The answer is ${move.san}.`, squares: [from, to] };
}

export function filterByLevel(puzzles: Puzzle[], maxRating: number): Puzzle[] {
  return puzzles.filter((p) => p.rating === undefined || p.rating <= maxRating);
}

export const LEVEL_MAX_RATING = { beginner: 900, intermediate: 1400, advanced: 1900, expert: 3000 } as const;
