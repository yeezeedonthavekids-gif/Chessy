import { useEffect, useState } from 'react';
import type { AnalysisContext } from '../lib/fairplay/gate';
import { checkAnalysis } from '../lib/fairplay/gate';
import type { PositionEval } from '../lib/analysis/types';
import { AbortError } from '../lib/engine/engine';
import { evaluatePosition, getEngine } from '../lib/engine/service';
import { toPositionEval } from '../lib/analysis/analyzeGame';
import { liveStatusStore } from '../state/liveStatus';
import { useStore } from '../state/store';

/**
 * Live multi-PV engine lines for the position on screen. Restarts on every
 * position change and cancels the previous search.
 */
export function useEngineLines(fen: string | null, ctx: AnalysisContext | null, opts: { depth: number; multiPv: number; enabled: boolean }) {
  const [result, setResult] = useState<PositionEval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const live = useStore(liveStatusStore);
  const decision = ctx ? checkAnalysis(ctx, live) : { allowed: false as const, reason: '' };
  const allowed = decision.allowed;
  const ctxKey = ctx ? JSON.stringify(ctx) : '';

  useEffect(() => {
    setResult(null);
    setError(null);
    if (!fen || !ctx || !opts.enabled || !allowed) return;
    const ac = new AbortController();
    setSearching(true);
    evaluatePosition(fen, ctx, {
      depth: opts.depth,
      multiPv: opts.multiPv,
      signal: ac.signal,
      onInfo: (lines) => {
        if (!ac.signal.aborted && lines[0] && lines[0].depth >= 8) {
          setResult(toPositionEval(fen, { depth: lines[0].depth, lines, bestMove: lines[0].pv[0] ?? null }));
        }
      },
    })
      .then((r) => !ac.signal.aborted && setResult(r))
      .catch((e) => {
        if (!(e instanceof AbortError) && !ac.signal.aborted) setError((e as Error).message);
      })
      .finally(() => !ac.signal.aborted && setSearching(false));
    return () => {
      ac.abort();
      getEngine().clearQueue();
      setSearching(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, ctxKey, opts.depth, opts.multiPv, opts.enabled, allowed]);

  return { result, error, searching, blockedReason: allowed ? null : (decision as { reason: string }).reason };
}
