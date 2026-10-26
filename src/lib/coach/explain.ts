import { Chess, type Square } from 'chess.js';
import { PIECE_NAME, PIECE_VALUE, forkTargets, hangingPieces, materialAlongLine, materialBalance } from '../chess/position';
import { formatLine } from '../chess/pgn';
import { formatScore } from '../engine/uci';
import { CLASS_LABEL } from '../analysis/classify';
import { positionCp } from '../analysis/analyzeGame';
import type { GameAnalysis, Motif, MoveAnalysis, PositionEval } from '../analysis/types';
import type { SkillLevel } from '../../state/settings';
import type { CoachBlock } from './types';

const pctWin = (wc: number) => Math.round(50 + 50 * wc);

export function scoreLabel(p: PositionEval): string {
  if (p.terminal === 'checkmate') return 'checkmate';
  if (p.terminal) return '0.00 (draw)';
  return formatScore({ cp: p.cp, mate: p.mate });
}

/** Describes what a single move does, using only board facts. */
export function describeMoveEffect(fenBefore: string, san: string): string[] {
  const chess = new Chess(fenBefore);
  let move;
  try {
    move = chess.move(san);
  } catch {
    return [];
  }
  const facts: string[] = [];
  const name = PIECE_NAME[move.piece];
  if (move.san.endsWith('#')) facts.push('it is checkmate');
  else if (move.san.includes('+')) facts.push('it gives check');
  if (move.captured) facts.push(`it captures the ${PIECE_NAME[move.captured]} on ${move.to}`);
  if (move.promotion) facts.push(`it promotes to a ${PIECE_NAME[move.promotion]}`);
  if (move.san.startsWith('O-O')) facts.push('it castles the king to safety');
  const targets = forkTargets(chess, move.to as Square);
  if (targets.length >= 2) {
    const names = targets.map((t) => `${PIECE_NAME[chess.get(t)!.type]} on ${t}`);
    facts.push(`the ${name} attacks ${names.join(' and ')} at the same time`);
  } else {
    const enemy = chess.turn();
    // Only mention attacks on pieces (not pawns) that are genuinely loose.
    const hanging = hangingPieces(chess, enemy).filter(
      (h) => h.type !== 'p' && chess.attackers(h.square, move.color).includes(move.to as Square),
    );
    if (hanging.length) facts.push(`it attacks the ${PIECE_NAME[hanging[0].type]} on ${hanging[0].square}`);
  }
  if (isSacrifice(chess, move.to as Square, move.piece, move.captured)) {
    facts.push(`it offers the ${name} as a sacrifice`);
  }
  return facts;
}

/** True if the piece just moved to `sq` can be taken and is worth more than what it captured. */
function isSacrifice(after: Chess, sq: Square, piece: keyof typeof PIECE_VALUE, captured?: keyof typeof PIECE_VALUE): boolean {
  if (piece === 'p' || piece === 'k') return false;
  const enemy = after.turn();
  const own = enemy === 'w' ? 'b' : 'w';
  const attackers = after.attackers(sq, enemy);
  if (!attackers.length) return false;
  const gain = captured ? PIECE_VALUE[captured] : 0;
  const defended = after.attackers(sq, own).length > 0;
  const cheapest = Math.min(...attackers.map((a) => PIECE_VALUE[after.get(a)!.type] || 100));
  return PIECE_VALUE[piece] - gain >= 2 && (!defended || cheapest < PIECE_VALUE[piece]);
}

/** Narrates a forcing solution line (solver, reply, solver…) using board facts only. */
export function explainSolution(fen: string, sans: string[]): string {
  if (!sans.length) return '';
  const chess = new Chess(fen);
  const solver = chess.turn();
  const startBalance = materialBalance(chess, solver);
  const parts: string[] = [];
  sans.forEach((san, i) => {
    const before = chess.fen();
    let m;
    try {
      m = chess.move(san);
    } catch {
      return;
    }
    if (i % 2 === 0) {
      const facts = describeMoveEffect(before, san).filter((f) => f !== 'it is checkmate');
      if (m.san.endsWith('#')) parts.push(i === 0 ? `${m.san} is checkmate${facts.length ? ` — ${facts.join(', ')}` : ''}.` : `and ${m.san} is checkmate.`);
      else parts.push(`${m.san}${facts.length ? ` — ${facts.join(', ')}` : ''}.`);
    } else {
      const forced = new Chess(before).moves().length === 1;
      const opponent = solver === 'w' ? 'Black' : 'White';
      parts.push(`${forced ? 'The only reply is' : `${opponent}'s best defence is`} ${m.san}${i === sans.length - 1 ? '.' : ','}`);
    }
  });
  if (!chess.isCheckmate()) {
    const gained = materialBalance(chess, solver) - startBalance;
    if (gained >= 2) parts.push(`The sequence wins about ${gained} points of material.`);
  }
  return parts.join(' ');
}

const MOTIF_TEXT: Record<Motif, (m: MoveAnalysis, level: SkillLevel) => string> = {
  'missed-mate': (m) =>
    `There was a forced checkmate: ${m.bestLineSan.slice(0, 7).join(' ')}. When the enemy king is exposed, check every forcing move first.`,
  'allowed-mate': (m) =>
    `After ${m.san}, your opponent has a forced mate starting with ${m.replyLineSan[0] ?? 'a check'}. Always ask "what checks does my opponent have?" before moving.`,
  'hung-piece': (m) =>
    `${m.san} leaves material en prise: your opponent can answer ${m.replyLineSan[0]} and come out ahead in the exchange.`,
  'missed-material': (m) => `${m.bestMoveSan} would have won material. Look at every capture before choosing a quiet move.`,
  'missed-fork': (m) => `${m.bestMoveSan} was a double attack — one piece hitting two targets.`,
  'allowed-fork': (m) => `After ${m.san}, ${m.replyLineSan[0]} attacks two of your pieces at once.`,
  'missed-win': () => 'You had a winning position here, and this move gave most of that advantage back.',
  'threw-advantage': () => 'You were better before this move; afterwards the position is roughly level or worse.',
  'opening-principle': (m, level) =>
    level === 'beginner'
      ? `In the opening, try to develop knights and bishops and castle. ${m.san} spends time on something else.`
      : `${m.san} breaks an opening principle (early queen, king move or slow flank pawn) and costs development time.`,
  'endgame-technique': () =>
    'This was an endgame mistake. In endgames, king activity and pawn races decide — calculate them concretely.',
  'time-pressure': (m) => `You had about ${Math.round(m.clock ?? 0)}s left. Low on time, prefer safe and simple moves.`,
};

/** Explanation blocks for one analyzed move: engine facts first, then coaching. */
export function explainMove(analysis: GameAnalysis, ply: number, level: SkillLevel): CoachBlock[] {
  const m = analysis.moves[ply - 1];
  if (!m) return [];
  const before = analysis.positions[ply - 1];
  const after = analysis.positions[ply];
  const blocks: CoachBlock[] = [];
  const mover = m.color === 'w' ? 'White' : 'Black';
  const moveLabel = `${Math.ceil(ply / 2)}${m.color === 'w' ? '.' : '...'}${m.san}`;

  const engineLines = [
    `Classification: ${CLASS_LABEL[m.classification]}`,
    `Evaluation: ${scoreLabel(before)} → ${scoreLabel(after)} (White's perspective)`,
    `${mover}'s winning chances: ${pctWin(m.wcBefore)}% → ${pctWin(m.wcAfter)}%`,
  ];
  if (m.bestMoveSan && m.bestMoveUci !== m.uci) {
    engineLines.push(`Engine best move: ${m.bestMoveSan}`);
    if (m.bestLineSan.length > 1) engineLines.push(`Best line: ${formatLine(before.fen, m.bestLineSan.slice(0, 8))}`);
  }
  if (m.replyLineSan.length && m.classification !== 'best' && m.classification !== 'only-move') {
    engineLines.push(`Expected reply after ${m.san}: ${formatLine(after.fen, m.replyLineSan.slice(0, 6))}`);
  }
  blocks.push({ kind: 'engine', title: `Stockfish · depth ${before.depth || analysis.depth}`, lines: engineLines });

  const coach: string[] = [];
  switch (m.classification) {
    case 'best':
    case 'only-move':
    case 'excellent':
      coach.push(
        m.classification === 'only-move'
          ? `${moveLabel} was the only move that keeps the balance — every alternative was much worse. Well found.`
          : `${moveLabel} is ${m.classification === 'best' ? "the engine's top choice" : 'as good as the top choice'}.`,
      );
      break;
    case 'book':
      coach.push(`${moveLabel} is a known opening move (it appears in the ECO opening database).`);
      break;
    case 'forced':
      coach.push(`${moveLabel} was the only legal move.`);
      break;
    case 'good':
      coach.push(`${moveLabel} is a reasonable move; the engine slightly prefers ${m.bestMoveSan}.`);
      break;
    default: {
      const severity = m.classification === 'blunder' ? 'a serious error' : m.classification === 'mistake' ? 'a clear mistake' : 'an imprecision';
      coach.push(`${moveLabel} was ${severity}.`);
      if (m.bestMoveSan) {
        const effect = describeMoveEffect(before.fen, m.bestMoveSan);
        coach.push(`Better was ${m.bestMoveSan}${effect.length ? ` — ${effect.join(', ')}` : ''}.`);
      }
      if (m.replyLineSan[0]) {
        const effect = describeMoveEffect(after.fen, m.replyLineSan[0]);
        if (effect.length) coach.push(`After ${m.san}, the reply ${m.replyLineSan[0]} is strong because ${effect.join(', ')}.`);
      }
    }
  }
  if (coach.length) blocks.push({ kind: 'text', source: 'coach', text: coach.join(' ') });

  if (m.motifs.length) {
    blocks.push({
      kind: 'heuristic',
      text: 'Patterns detected:',
      bullets: m.motifs.map((x) => MOTIF_TEXT[x](m, level)),
    });
  }

  // Material check along the reply line, to make "why" concrete.
  if ((m.classification === 'blunder' || m.classification === 'mistake') && m.replyLineSan.length >= 2) {
    const start = materialBalance(new Chess(after.fen), m.color);
    const line = materialAlongLine(after.fen, m.replyLineSan, m.color, 4);
    const delta = (line[line.length - 1] ?? start) - start;
    if (delta <= -1) {
      blocks.push({
        kind: 'heuristic',
        text: `Following the engine's line, ${mover} loses about ${Math.abs(delta)} point${Math.abs(delta) > 1 ? 's' : ''} of material within ${line.length} moves.`,
      });
    }
  }
  if (level === 'beginner' && (m.classification === 'blunder' || m.classification === 'mistake')) {
    blocks.push({
      kind: 'text',
      source: 'coach',
      text: 'Rule of thumb: before every move, check all of your opponent\'s checks, captures and threats. Most blunders come from skipping that step.',
    });
  }
  return blocks;
}

/** Finds the user's biggest mistake (largest win-chance loss) in a game. */
export function biggestMistake(analysis: GameAnalysis, color: 'w' | 'b' | null): MoveAnalysis | undefined {
  return analysis.moves
    .filter((m) => (color ? m.color === color : true))
    .reduce<MoveAnalysis | undefined>((worst, m) => (!worst || m.wcLoss > worst.wcLoss ? m : worst), undefined);
}

export function pieceValue(type: keyof typeof PIECE_VALUE) {
  return PIECE_VALUE[type];
}

export { positionCp };
