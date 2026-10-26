import { useCallback, useEffect, useRef, useState } from 'react';
import { runGameAnalysis } from '../lib/analysis/runner';
import type { GameAnalysis } from '../lib/analysis/types';
import type { StoredGame } from '../lib/chess/types';
import { AbortError, EngineError } from '../lib/engine/engine';
import { FairPlayBlockedError, getEngine } from '../lib/engine/service';

export type RunState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'error'; message: string; blocked?: boolean };

/**
 * Runs full-game analysis for a completed game. Analysis is cancelled when the
 * component unmounts (navigating away) or the game changes.
 */
export function useGameAnalysis(game: StoredGame | undefined) {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    getEngine().clearQueue();
  }, []);

  useEffect(() => () => cancel(), [game?.id, cancel]);

  const run = useCallback(
    async (depth: number): Promise<GameAnalysis | null> => {
      if (!game) return null;
      cancel();
      const ac = new AbortController();
      controller.current = ac;
      setState({ status: 'running', done: 0, total: game.plies.length + 1 });
      try {
        const analysis = await runGameAnalysis(game, depth, ac.signal, (done, total) => setState({ status: 'running', done, total }));
        setState({ status: 'idle' });
        return analysis;
      } catch (e) {
        if (e instanceof AbortError || (e as Error).name === 'AbortError') {
          setState({ status: 'idle' });
        } else if (e instanceof FairPlayBlockedError) {
          setState({ status: 'error', message: e.message, blocked: true });
        } else if (e instanceof EngineError) {
          setState({ status: 'error', message: e.message });
        } else {
          setState({ status: 'error', message: `Analysis failed: ${(e as Error).message}` });
        }
        return null;
      } finally {
        if (controller.current === ac) controller.current = null;
      }
    },
    [game, cancel],
  );

  return { state, run, cancel };
}
