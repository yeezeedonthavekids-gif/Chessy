import { Chess } from 'chess.js';
import { epd, uciLineToSan } from '../chess/pgn';
import { forkTargets, gamePhase, legalMoveCount, materialAlongLine, materialBalance } from '../chess/position';
import type { Color, ParsedGame } from '../chess/types';
import { toWhitePov } from '../engine/uci';
import { AbortError } from '../engine/engine';
import { THRESHOLDS, classifyMove, evalCp, moveAccuracy, povChances, winningChances } from './classify';
import type { GameAnalysis, Motif, MoveAnalysis, MoveClass, PlayerSummary, PositionEval } from './types';

export type Evaluator = (fen: string, signal?: AbortSignal) => Promise<PositionEval>;

export interface AnalyzeOptions {
  depth: number;
  evaluate: Evaluator;
  engineName?: string;
  signal?: AbortSignal;
  isBook?: (epd: string) => boolean;
  onProgress?: (done: number, total: number) => void;
}

/** Evaluates terminal positions by the rules, without the engine. */
export function terminalEval(fen: string): PositionEval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return { fen, depth: 0, mate: 0, lines: [], bestMove: null, terminal: 'checkmate' };
  }
  if (chess.isStalemate()) return { fen, depth: 0, cp: 0, lines: [], bestMove: null, terminal: 'stalemate' };
  if (chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) {
    return { fen, depth: 0, cp: 0, lines: [], bestMove: null, terminal: 'draw' };
  }
  return null;
}

/** White-POV winning chances, resolving checkmate by whose turn it is. */
export function positionChances(p: PositionEval): number {
  if (p.terminal === 'checkmate') return p.fen.split(' ')[1] === 'w' ? -1 : 1;
  if (p.mate !== undefined) return p.mate > 0 ? 1 : p.mate < 0 ? -1 : 0;
  return winningChances(p.cp ?? 0);
}

export function positionCp(p: PositionEval): number {
  if (p.terminal === 'checkmate') return p.fen.split(' ')[1] === 'w' ? -1000 : 1000;
  return evalCp(p);
}

function moverMate(p: PositionEval, color: Color): number | undefined {
  if (p.terminal === 'checkmate') return undefined;
  if (p.mate === undefined) return undefined;
  return color === 'w' ? p.mate : -p.mate;
}

function parseIncrement(tc: string | undefined): number {
  const m = tc?.match(/^\d+\+(\d+)/);
  return m ? Number(m[1]) : 0;
}

function parseBase(tc: string | undefined): number | undefined {
  const m = tc?.match(/^(\d+)/);
  return m ? Number(m[1]) : undefined;
}

const SEVERITY: MoveClass[] = ['inaccuracy', 'mistake', 'blunder'];
const atLeast = (c: MoveClass, min: 'inaccuracy' | 'mistake' | 'blunder') =>
  SEVERITY.indexOf(c) >= SEVERITY.indexOf(min);

export function detectMotifs(args: {
  fenBefore: string;
  fenAfter: string;
  color: Color;
  san: string;
  ply: number;
  phase: MoveAnalysis['phase'];
  classification: MoveClass;
  before: PositionEval;
  after: PositionEval;
  wcBefore: number;
  wcAfter: number;
  bestLineSan: string[];
  replyLineSan: string[];
  playedBest: boolean;
  clock?: number;
  baseTime?: number;
}): Motif[] {
  const motifs = new Set<Motif>();
  const { color, classification } = args;
  if (!atLeast(classification, 'inaccuracy')) return [];

  const mateBefore = moverMate(args.before, color);
  const mateAfter = moverMate(args.after, color);
  if (mateBefore !== undefined && mateBefore > 0 && !(mateAfter !== undefined && mateAfter > 0)) {
    motifs.add('missed-mate');
  }
  if (mateAfter !== undefined && mateAfter < 0 && !(mateBefore !== undefined && mateBefore < 0)) {
    motifs.add('allowed-mate');
  }

  const start = materialBalance(new Chess(args.fenAfter), color);
  const reply = materialAlongLine(args.fenAfter, args.replyLineSan, color, 4);
  if (reply.length >= 1 && /x/.test(args.replyLineSan[0] ?? '') && reply[reply.length - 1] - start <= -2) {
    motifs.add('hung-piece');
  }

  if (!args.playedBest && args.bestLineSan.length) {
    const startBefore = materialBalance(new Chess(args.fenBefore), color);
    const best = materialAlongLine(args.fenBefore, args.bestLineSan, color, 4);
    const playedGain = start - startBefore;
    if (best.length && best[best.length - 1] - startBefore >= 2 && playedGain < 2) motifs.add('missed-material');

    const afterBest = new Chess(args.fenBefore);
    try {
      const m = afterBest.move(args.bestLineSan[0]);
      if (forkTargets(afterBest, m.to).length >= 2) motifs.add('missed-fork');
    } catch {
      /* engine line no longer legal; ignore */
    }
  }

  if (args.replyLineSan.length && atLeast(classification, 'mistake')) {
    const afterReply = new Chess(args.fenAfter);
    try {
      const m = afterReply.move(args.replyLineSan[0]);
      if (forkTargets(afterReply, m.to).length >= 2) motifs.add('allowed-fork');
    } catch {
      /* ignore */
    }
  }

  if (args.wcBefore >= 0.6 && args.wcAfter < 0.3) motifs.add('missed-win');
  else if (args.wcBefore >= 0.3 && args.wcAfter <= 0.05 && atLeast(classification, 'mistake')) {
    motifs.add('threw-advantage');
  }

  if (args.phase === 'opening') {
    const piece = args.san[0];
    const earlyQueen = piece === 'Q' && args.ply <= 14;
    const kingWalk = piece === 'K';
    const flankPawn = /^[abgh][3-5]$/.test(args.san) && args.ply <= 16;
    if (earlyQueen || kingWalk || flankPawn) motifs.add('opening-principle');
  }
  if (args.phase === 'endgame' && atLeast(classification, 'mistake')) motifs.add('endgame-technique');

  if (args.clock !== undefined && atLeast(classification, 'mistake')) {
    const low = args.clock < 30 || (args.baseTime !== undefined && args.clock < args.baseTime * 0.1);
    if (low) motifs.add('time-pressure');
  }
  return [...motifs];
}

export function summarize(moves: MoveAnalysis[], color: Color): PlayerSummary {
  const own = moves.filter((m) => m.color === color);
  const counts = {
    book: 0,
    forced: 0,
    'only-move': 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  } as Record<MoveClass, number>;
  own.forEach((m) => counts[m.classification]++);
  const scored = own.filter((m) => m.classification !== 'forced' && m.classification !== 'book');
  const accuracy = scored.length ? scored.reduce((s, m) => s + m.accuracy, 0) / scored.length : 100;
  const acpl = own.length ? own.reduce((s, m) => s + m.cpLoss, 0) / own.length : 0;
  return { accuracy: Math.round(accuracy * 10) / 10, acpl: Math.round(acpl), counts };
}

/**
 * Analyzes every position of a completed game with the injected evaluator and
 * classifies each move. The evaluator is expected to respect the AbortSignal.
 */
export async function analyzeGame(game: ParsedGame & { id: string }, opts: AnalyzeOptions): Promise<GameAnalysis> {
  const fens = [game.startFen, ...game.plies.map((p) => p.fenAfter)];
  const positions: PositionEval[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (opts.signal?.aborted) throw new AbortError();
    const terminal = terminalEval(fens[i]);
    positions.push(terminal ?? (await opts.evaluate(fens[i], opts.signal)));
    opts.onProgress?.(i + 1, fens.length);
  }

  const inc = parseIncrement(game.headers.TimeControl);
  const base = parseBase(game.headers.TimeControl);
  const lastClock: Partial<Record<Color, number>> = {};
  let stillBook = true;

  const moves: MoveAnalysis[] = game.plies.map((p, i) => {
    const before = positions[i];
    const after = positions[i + 1];
    const wcBefore = povChances(positionChances(before), p.color);
    const wcAfter = povChances(positionChances(after), p.color);
    const wcLossRaw = Math.max(0, wcBefore - wcAfter);
    const playedBest = before.bestMove === p.uci;
    const wcLoss = playedBest ? 0 : wcLossRaw;
    const cpBefore = p.color === 'w' ? positionCp(before) : -positionCp(before);
    const cpAfter = p.color === 'w' ? positionCp(after) : -positionCp(after);
    const cpLoss = playedBest ? 0 : Math.max(0, Math.min(1000, cpBefore - cpAfter));

    let secondBestGap: number | undefined;
    if (before.lines.length >= 2) {
      const toChances = (l: (typeof before.lines)[number]) =>
        l.mate !== undefined ? (l.mate > 0 ? 1 : -1) : winningChances(l.cp ?? 0);
      secondBestGap = toChances(before.lines[0]) - toChances(before.lines[1]);
    }
    const book = stillBook && !!opts.isBook?.(epd(p.fenAfter));
    if (!book) stillBook = false;

    const classification = classifyMove({
      wcLoss,
      playedBest,
      legalMoveCount: legalMoveCount(p.fenBefore),
      secondBestGap,
      inBook: book,
    });
    const winPct = (wc: number) => 50 + 50 * wc;
    const accuracy = playedBest ? 100 : moveAccuracy(winPct(wcBefore), winPct(wcAfter));
    const bestLineSan = before.lines[0] ? uciLineToSan(p.fenBefore, before.lines[0].pv.slice(0, 8)) : [];
    const replyLineSan = after.lines[0] ? uciLineToSan(p.fenAfter, after.lines[0].pv.slice(0, 8)) : [];
    const phase = gamePhase(p.fenBefore, p.ply);

    let timeSpent: number | undefined;
    if (p.clock !== undefined) {
      const prev = lastClock[p.color] ?? base;
      if (prev !== undefined) timeSpent = Math.max(0, Math.round((prev - p.clock + inc) * 10) / 10);
      lastClock[p.color] = p.clock;
    }

    const motifs = detectMotifs({
      fenBefore: p.fenBefore,
      fenAfter: p.fenAfter,
      color: p.color,
      san: p.san,
      ply: p.ply,
      phase,
      classification,
      before,
      after,
      wcBefore,
      wcAfter,
      bestLineSan,
      replyLineSan,
      playedBest,
      clock: p.clock,
      baseTime: base,
    });

    return {
      ply: p.ply,
      color: p.color,
      san: p.san,
      uci: p.uci,
      phase,
      wcBefore,
      wcAfter,
      wcLoss,
      cpLoss,
      accuracy,
      classification,
      bestMoveUci: before.bestMove,
      bestMoveSan: bestLineSan[0] ?? null,
      bestLineSan,
      replyLineSan,
      motifs,
      clock: p.clock,
      timeSpent,
    };
  });

  return {
    gameId: game.id,
    depth: opts.depth,
    engine: opts.engineName ?? 'Stockfish',
    createdAt: Date.now(),
    positions,
    moves,
    white: summarize(moves, 'w'),
    black: summarize(moves, 'b'),
  };
}

/** Converts a raw engine search into a White-POV PositionEval. */
export function toPositionEval(
  fen: string,
  r: { depth: number; lines: PositionEval['lines']; bestMove: string | null },
): PositionEval {
  const top = r.lines[0];
  const stm = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const pov = top ? toWhitePov({ cp: top.cp, mate: top.mate }, stm) : { cp: 0 };
  return { fen, depth: r.depth, cp: pov.cp, mate: pov.mate, lines: r.lines, bestMove: r.bestMove };
}

export { THRESHOLDS };
