import { Chess } from 'chess.js';

const SAN_RE = /\b(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8](?:=[QRBN])?[+#]?)(?![\w-])/g;

/** Extracts SAN-looking tokens from free text. */
export function extractSanMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(SAN_RE)) {
    const san = m[1];
    // Bare squares like "e4" are ambiguous in prose ("the e4 pawn"); keep them only as pawn moves.
    out.add(san.replace(/[+#]$/, ''));
  }
  return [...out];
}

/**
 * Flags moves in AI-written text that are neither legal in the current
 * position nor part of the supplied engine lines. Bare-square tokens are only
 * flagged when they cannot be a legal pawn move AND are not a square that
 * holds a piece (prose like "the knight on f3").
 */
export function unverifiedMoves(text: string, fen: string | undefined, engineSans: string[]): string[] {
  const known = new Set(engineSans.map((s) => s.replace(/[+#?!]+$/, '')));
  let legal = new Set<string>();
  let chess: Chess | null = null;
  if (fen) {
    try {
      chess = new Chess(fen);
      legal = new Set(chess.moves().map((s) => s.replace(/[+#]$/, '')));
    } catch {
      chess = null;
    }
  }
  return extractSanMentions(text).filter((san) => {
    if (known.has(san) || legal.has(san)) return false;
    if (/^[a-h][1-8]$/.test(san)) return false; // bare squares are usually prose, not moves
    return true;
  });
}
