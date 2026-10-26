import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StoredGame } from '../chess/types';
import type { GameAnalysis, PositionEval } from '../analysis/types';

export interface RepertoireLine {
  id: string;
  color: 'w' | 'b';
  name: string;
  /** SAN moves from the initial position. */
  moves: string[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface PuzzleAttempt {
  id: string;
  puzzleId: string;
  source: 'builtin' | 'own-game';
  themes: string[];
  solved: boolean;
  hintsUsed: number;
  at: number;
}

export interface CoachMemoryEntry {
  id: string;
  kind: 'note' | 'lesson-completed' | 'quiz-result';
  text: string;
  at: number;
}

interface ChessyDB extends DBSchema {
  games: { key: string; value: StoredGame; indexes: { playedAt: number; externalId: string } };
  analyses: { key: string; value: GameAnalysis };
  evalCache: { key: string; value: PositionEval & { key: string; at: number } };
  repertoire: { key: string; value: RepertoireLine; indexes: { color: string } };
  attempts: { key: string; value: PuzzleAttempt; indexes: { at: number } };
  coachMemory: { key: string; value: CoachMemoryEntry; indexes: { at: number } };
}

const DB_NAME = 'chessy';
const DB_VERSION = 1;
let dbPromise: Promise<IDBPDatabase<ChessyDB>> | null = null;

export function db(): Promise<IDBPDatabase<ChessyDB>> {
  if (!dbPromise) {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available in this browser (private mode?).'));
    }
    dbPromise = openDB<ChessyDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        const games = d.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('playedAt', 'playedAt');
        games.createIndex('externalId', 'externalId');
        d.createObjectStore('analyses', { keyPath: 'gameId' });
        d.createObjectStore('evalCache', { keyPath: 'key' });
        const rep = d.createObjectStore('repertoire', { keyPath: 'id' });
        rep.createIndex('color', 'color');
        const att = d.createObjectStore('attempts', { keyPath: 'id' });
        att.createIndex('at', 'at');
        const mem = d.createObjectStore('coachMemory', { keyPath: 'id' });
        mem.createIndex('at', 'at');
      },
    });
  }
  return dbPromise;
}

/** For tests: forget the cached connection. */
export function resetDbConnection() {
  dbPromise = null;
}

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}_${rnd}` : rnd;
}

// ---- games ----
export async function listGames(): Promise<StoredGame[]> {
  const all = await (await db()).getAllFromIndex('games', 'playedAt');
  return all.reverse();
}
export async function getGame(id: string) {
  return (await db()).get('games', id);
}
export async function putGames(games: StoredGame[]) {
  const tx = (await db()).transaction('games', 'readwrite');
  await Promise.all([...games.map((g) => tx.store.put(g)), tx.done]);
}
export async function deleteGame(id: string) {
  const d = await db();
  await d.delete('games', id);
  await d.delete('analyses', id);
}
export async function hasExternalId(externalId: string) {
  return (await (await db()).getKeyFromIndex('games', 'externalId', externalId)) !== undefined;
}

// ---- analyses ----
export async function getAnalysis(gameId: string) {
  return (await db()).get('analyses', gameId);
}
export async function putAnalysis(a: GameAnalysis) {
  await (await db()).put('analyses', a);
}
export async function listAnalyses() {
  return (await db()).getAll('analyses');
}

// ---- eval cache ----
export function evalKey(fen: string, depth: number, multiPv: number) {
  return `${fen.split(' ').slice(0, 4).join(' ')}|d${depth}|m${multiPv}`;
}
export async function getCachedEval(fen: string, depth: number, multiPv: number) {
  return (await db()).get('evalCache', evalKey(fen, depth, multiPv));
}
export async function putCachedEval(e: PositionEval, depth: number, multiPv: number) {
  await (await db()).put('evalCache', { ...e, key: evalKey(e.fen, depth, multiPv), at: Date.now() });
}

// ---- repertoire ----
export async function listRepertoire() {
  return (await db()).getAll('repertoire');
}
export async function putRepertoireLine(line: RepertoireLine) {
  await (await db()).put('repertoire', line);
}
export async function deleteRepertoireLine(id: string) {
  await (await db()).delete('repertoire', id);
}

// ---- puzzle attempts ----
export async function addAttempt(a: PuzzleAttempt) {
  await (await db()).put('attempts', a);
}
export async function listAttempts() {
  return (await db()).getAllFromIndex('attempts', 'at');
}

// ---- coach memory ----
export async function addMemory(entry: CoachMemoryEntry) {
  await (await db()).put('coachMemory', entry);
}
export async function listMemory() {
  return (await db()).getAllFromIndex('coachMemory', 'at');
}
export async function clearMemory() {
  await (await db()).clear('coachMemory');
}

// ---- data management ----
export async function exportAll() {
  const d = await db();
  return {
    format: 'chessy-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    games: await d.getAll('games'),
    analyses: await d.getAll('analyses'),
    repertoire: await d.getAll('repertoire'),
    attempts: await d.getAll('attempts'),
    coachMemory: await d.getAll('coachMemory'),
  };
}

/** Merges a file produced by exportAll() into this browser's database. Returns counts per store. */
export async function importAll(text: string) {
  let data: Partial<Awaited<ReturnType<typeof exportAll>>>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (data.format !== 'chessy-export') throw new Error('That file is not a Chessy export.');
  const d = await db();
  const counts = { games: 0, analyses: 0, repertoire: 0, attempts: 0, coachMemory: 0 };
  for (const store of Object.keys(counts) as (keyof typeof counts)[]) {
    const rows = (data[store] ?? []) as never[];
    if (!Array.isArray(rows)) continue;
    const tx = d.transaction(store, 'readwrite');
    await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done]);
    counts[store] = rows.length;
  }
  return counts;
}

export async function clearStore(name: 'games' | 'analyses' | 'evalCache' | 'repertoire' | 'attempts' | 'coachMemory') {
  await (await db()).clear(name);
}

export async function deleteEverything() {
  const d = await db();
  for (const name of ['games', 'analyses', 'evalCache', 'repertoire', 'attempts', 'coachMemory'] as const) {
    await d.clear(name);
  }
}
