import { Chess, type Square } from 'chess.js';
import { PIECE_NAME, gamePhase, hangingPieces, material, squaresOf } from '../chess/position';
import type { Color } from '../chess/types';
import type { Phase } from '../analysis/types';

export interface SideFeatures {
  material: number;
  undevelopedMinors: number;
  castled: 'kingside' | 'queenside' | 'no';
  canCastle: boolean;
  kingSquare: Square;
  kingShield: number;
  passedPawns: Square[];
  isolatedPawns: Square[];
  doubledFiles: string[];
  hanging: { square: Square; type: string }[];
  rooksOnOpenFiles: Square[];
  centralPawns: Square[];
  mobility: number;
}

export interface PositionFeatures {
  fen: string;
  sideToMove: Color;
  phase: Phase;
  inCheck: boolean;
  checkmate: boolean;
  stalemate: boolean;
  materialBalance: number;
  openFiles: string[];
  w: SideFeatures;
  b: SideFeatures;
}

const FILES = 'abcdefgh';

function pawnFiles(chess: Chess, color: Color): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const { square, type } of squaresOf(chess, color)) {
    if (type !== 'p') continue;
    const arr = map.get(square[0]) ?? [];
    arr.push(Number(square[1]));
    map.set(square[0], arr);
  }
  return map;
}

function sideFeatures(chess: Chess, color: Color, openFiles: string[]): SideFeatures {
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const pieces = squaresOf(chess, color);
  const king = pieces.find((p) => p.type === 'k')!.square;
  const homeRank = color === 'w' ? '1' : '8';
  const minorsHome = color === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'];
  const undevelopedMinors = pieces.filter((p) => (p.type === 'n' || p.type === 'b') && minorsHome.includes(p.square)).length;

  const castled: SideFeatures['castled'] =
    king === (color === 'w' ? 'g1' : 'g8') || king === (color === 'w' ? 'h1' : 'h8')
      ? 'kingside'
      : king === (color === 'w' ? 'c1' : 'c8') || king === (color === 'w' ? 'b1' : 'b8')
        ? 'queenside'
        : 'no';
  const rights = chess.getCastlingRights(color);

  // Pawns directly in front of the king (three files, two ranks).
  const dir = color === 'w' ? 1 : -1;
  const kf = FILES.indexOf(king[0]);
  const kr = Number(king[1]);
  let kingShield = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = 1; dr <= 2; dr++) {
      const f = FILES[kf + df];
      const r = kr + dir * dr;
      if (!f || r < 1 || r > 8) continue;
      const p = chess.get(`${f}${r}` as Square);
      if (p && p.type === 'p' && p.color === color) kingShield++;
    }
  }

  const own = pawnFiles(chess, color);
  const theirs = pawnFiles(chess, enemy);
  const passedPawns: Square[] = [];
  const isolatedPawns: Square[] = [];
  const doubledFiles: string[] = [];
  for (const [file, ranks] of own) {
    if (ranks.length > 1) doubledFiles.push(file);
    const fi = FILES.indexOf(file);
    const neighbours = [FILES[fi - 1], FILES[fi + 1]].filter(Boolean);
    if (!neighbours.some((n) => own.has(n))) ranks.forEach((r) => isolatedPawns.push(`${file}${r}` as Square));
    for (const r of ranks) {
      const blocked = [file, ...neighbours].some((f) =>
        (theirs.get(f) ?? []).some((er) => (color === 'w' ? er > r : er < r)),
      );
      if (!blocked) passedPawns.push(`${file}${r}` as Square);
    }
  }

  const centralPawns = pieces
    .filter((p) => p.type === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5', 'f4', 'f5'].includes(p.square))
    .map((p) => p.square);

  const rooksOnOpenFiles = pieces.filter((p) => p.type === 'r' && openFiles.includes(p.square[0])).map((p) => p.square);

  let mobility = 0;
  try {
    const fen = chess.fen().split(' ');
    fen[1] = color;
    fen[3] = '-';
    mobility = new Chess(fen.join(' ')).moves().length;
  } catch {
    mobility = 0; // side not to move is in check (illegal FEN when flipped)
  }

  const m = material(chess);
  return {
    material: color === 'w' ? m.w : m.b,
    undevelopedMinors,
    castled,
    canCastle: castled === 'no' && (rights.k || rights.q) && king[1] === homeRank,
    kingSquare: king,
    kingShield,
    passedPawns,
    isolatedPawns,
    doubledFiles,
    hanging: hangingPieces(chess, color).map((h) => ({ square: h.square, type: PIECE_NAME[h.type] })),
    rooksOnOpenFiles,
    centralPawns,
    mobility,
  };
}

export function analyzeFeatures(fen: string, ply = 30): PositionFeatures {
  const chess = new Chess(fen);
  const wp = pawnFiles(chess, 'w');
  const bp = pawnFiles(chess, 'b');
  const openFiles = FILES.split('').filter((f) => !wp.has(f) && !bp.has(f));
  const w = sideFeatures(chess, 'w', openFiles);
  const b = sideFeatures(chess, 'b', openFiles);
  return {
    fen,
    sideToMove: chess.turn(),
    phase: gamePhase(fen, ply),
    inCheck: chess.inCheck(),
    checkmate: chess.isCheckmate(),
    stalemate: chess.isStalemate(),
    materialBalance: w.material - b.material,
    openFiles,
    w,
    b,
  };
}

const sideName = (c: Color) => (c === 'w' ? 'White' : 'Black');

/** Plain-language observations about a position (rule-based, not engine output). */
export function describeFeatures(f: PositionFeatures, level: 'beginner' | 'intermediate' | 'advanced' | 'expert'): string[] {
  const out: string[] = [];
  const simple = level === 'beginner';
  if (f.checkmate) return [`${sideName(f.sideToMove)} is checkmated.`];
  if (f.stalemate) return ['It is stalemate — a draw.'];
  out.push(`It is ${sideName(f.sideToMove)} to move${f.inCheck ? ', and they are in check' : ''}. Phase: ${f.phase}.`);

  if (f.materialBalance === 0) out.push('Material is level.');
  else {
    const leader = f.materialBalance > 0 ? 'White' : 'Black';
    const pts = Math.abs(f.materialBalance);
    out.push(
      simple
        ? `${leader} has more material (about ${pts} point${pts > 1 ? 's' : ''} — a pawn is 1, a knight or bishop 3, a rook 5, a queen 9).`
        : `${leader} is up ${pts} point${pts > 1 ? 's' : ''} of material.`,
    );
  }

  for (const c of ['w', 'b'] as const) {
    const s = f[c];
    const name = sideName(c);
    if (s.hanging.length) {
      out.push(
        `${name}'s ${s.hanging.map((h) => `${h.type} on ${h.square}`).join(' and ')} ${s.hanging.length > 1 ? 'are' : 'is'} under-protected${simple ? ' — it can be captured without a fair trade' : ''}.`,
      );
    }
    if (f.phase !== 'endgame') {
      if (s.undevelopedMinors >= 2 && f.phase === 'opening') {
        out.push(`${name} still has ${s.undevelopedMinors} knights/bishops on their starting squares.`);
      }
      if (s.castled === 'no' && f.phase !== 'opening') {
        out.push(`${name}'s king is still in the centre${s.canCastle ? ' (castling is still possible)' : ' and can no longer castle'}.`);
      } else if (s.castled !== 'no' && s.kingShield <= 1) {
        out.push(`${name}'s castled king has few pawns in front of it — watch for attacks.`);
      }
    }
    if (s.passedPawns.length) {
      out.push(`${name} has a passed pawn on ${s.passedPawns.join(', ')}${simple ? ' (no enemy pawns can stop it on its way to promotion)' : ''}.`);
    }
    if (!simple && s.isolatedPawns.length) out.push(`${name} has isolated pawn${s.isolatedPawns.length > 1 ? 's' : ''} on ${s.isolatedPawns.join(', ')}.`);
    if (!simple && s.doubledFiles.length) out.push(`${name} has doubled pawns on the ${s.doubledFiles.join(', ')}-file.`);
    if (s.rooksOnOpenFiles.length) out.push(`${name} has a rook on an open file (${s.rooksOnOpenFiles.join(', ')}).`);
  }
  if (f.openFiles.length && !simple) out.push(`Open files: ${f.openFiles.join(', ')}.`);
  if (!simple && f.w.mobility && f.b.mobility) {
    const diff = f.w.mobility - f.b.mobility;
    if (Math.abs(diff) >= 10) out.push(`${diff > 0 ? 'White' : 'Black'} has noticeably more active pieces (${f.w.mobility} vs ${f.b.mobility} legal moves).`);
  }
  return out;
}
