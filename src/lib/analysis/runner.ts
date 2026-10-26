import type { StoredGame } from '../chess/types';
import { evaluatePosition, getEngine } from '../engine/service';
import { isBookPosition, loadOpenings } from '../openings/explorer';
import { putAnalysis } from '../storage/db';
import { dataStore } from '../../state/data';
import { analyzeGame } from './analyzeGame';
import type { GameAnalysis } from './types';

/** Analyzes one completed game through the fair-play gate, then stores and publishes the result. */
export async function runGameAnalysis(
  game: StoredGame,
  depth: number,
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<GameAnalysis> {
  const ctx = { kind: 'completed-game' as const, finished: game.finished, result: game.result };
  const { byEpd } = await loadOpenings();
  const analysis = await analyzeGame(game, {
    depth,
    engineName: getEngine().name,
    signal,
    isBook: (e) => isBookPosition(byEpd, e),
    evaluate: (fen, s) => evaluatePosition(fen, ctx, { depth, multiPv: 2, signal: s }),
    onProgress,
  });
  analysis.engine = getEngine().name;
  await putAnalysis(analysis);
  dataStore.set((s) => {
    const analyses = new Map(s.analyses);
    analyses.set(analysis.gameId, analysis);
    return { ...s, analyses };
  });
  return analysis;
}
