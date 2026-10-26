import type { StoredGame } from '../lib/chess/types';
import type { GameAnalysis } from '../lib/analysis/types';
import { listAnalyses, listGames } from '../lib/storage/db';
import { createStore } from './store';

export interface DataState {
  loaded: boolean;
  games: StoredGame[];
  analyses: Map<string, GameAnalysis>;
  error?: string;
}

export const dataStore = createStore<DataState>({ loaded: false, games: [], analyses: new Map() });

/** Reloads games and analyses from IndexedDB into memory. */
export async function reloadData() {
  try {
    const [games, analyses] = await Promise.all([listGames(), listAnalyses()]);
    dataStore.set({ loaded: true, games, analyses: new Map(analyses.map((a) => [a.gameId, a])) });
  } catch (e) {
    dataStore.set((s) => ({ ...s, loaded: true, error: (e as Error).message }));
  }
}
