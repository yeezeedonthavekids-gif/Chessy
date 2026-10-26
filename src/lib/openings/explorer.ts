import { Chess } from 'chess.js';
import { epd } from '../chess/pgn';

export interface Opening {
  eco: string;
  name: string;
  moves: string[];
  epd: string;
}

export const OPENINGS_SOURCE = 'lichess-org/chess-openings (CC0 public domain)';

let cache: Promise<{ list: Opening[]; byEpd: Map<string, Opening[]> }> | null = null;

/** Lazily loads the ~3,800-line ECO dataset (kept out of the main bundle). */
export function loadOpenings() {
  if (!cache) {
    cache = import('../../data/openings.json').then((mod) => {
      const raw = (mod.default ?? mod) as { entries: { eco: string; name: string; moves: string; epd: string }[] };
      const list: Opening[] = raw.entries.map((e) => ({ ...e, moves: e.moves.split(' ') }));
      const byEpd = new Map<string, Opening[]>();
      for (const o of list) {
        const arr = byEpd.get(o.epd) ?? [];
        arr.push(o);
        byEpd.set(o.epd, arr);
      }
      return { list, byEpd };
    });
  }
  return cache;
}

/** Name of the deepest known opening reached along a move sequence (transpositions included). */
export function identifyOpening(byEpd: Map<string, Opening[]>, fens: string[]): Opening | null {
  for (let i = fens.length - 1; i >= 0; i--) {
    const hit = byEpd.get(epd(fens[i]));
    if (hit?.length) return hit[0];
  }
  return null;
}

export interface Continuation {
  san: string;
  /** Named openings that continue with this move. */
  openings: Opening[];
}

/** Known continuations from a move sequence, grouped by next move. */
export function continuations(list: Opening[], moves: string[]): Continuation[] {
  const map = new Map<string, Opening[]>();
  for (const o of list) {
    if (o.moves.length <= moves.length) continue;
    let prefix = true;
    for (let i = 0; i < moves.length; i++) {
      if (o.moves[i] !== moves[i]) {
        prefix = false;
        break;
      }
    }
    if (!prefix) continue;
    const next = o.moves[moves.length];
    const arr = map.get(next) ?? [];
    arr.push(o);
    map.set(next, arr);
  }
  return [...map.entries()]
    .map(([san, openings]) => ({ san, openings: openings.sort((a, b) => a.moves.length - b.moves.length) }))
    .sort((a, b) => b.openings.length - a.openings.length);
}

export function fensForMoves(moves: string[]): string[] {
  const c = new Chess();
  const fens = [c.fen()];
  for (const m of moves) {
    c.move(m);
    fens.push(c.fen());
  }
  return fens;
}

export function isBookPosition(byEpd: Map<string, Opening[]>, positionEpd: string) {
  return byEpd.has(positionEpd);
}

export interface ExplorerStats {
  white: number;
  draws: number;
  black: number;
  moves: { san: string; white: number; draws: number; black: number }[];
  source: string;
}

/**
 * Optional: aggregate statistics from the Lichess opening explorer
 * (https://explorer.lichess.ovh). Requires network access; Lichess may require
 * a personal API token for this endpoint. Never needed for the rest of the app.
 */
export async function fetchLichessExplorer(fen: string, token?: string, signal?: AbortSignal): Promise<ExplorerStats> {
  const url = `https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200&fen=${encodeURIComponent(fen)}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, signal });
  if (res.status === 401) throw new Error('The Lichess opening explorer requires authentication for this request. The offline ECO explorer still works.');
  if (!res.ok) throw new Error(`Lichess explorer error (${res.status}).`);
  const j = (await res.json()) as ExplorerStats & { moves: { san: string; white: number; draws: number; black: number }[] };
  return {
    white: j.white,
    draws: j.draws,
    black: j.black,
    moves: j.moves.map((m) => ({ san: m.san, white: m.white, draws: m.draws, black: m.black })),
    source: 'Lichess opening explorer — rated Lichess games, 1600–2200, blitz/rapid/classical',
  };
}
