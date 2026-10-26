import { checkAnalysis, type AnalysisContext } from '../fairplay/gate';
import { getCachedEval, putCachedEval } from '../storage/db';
import { toPositionEval, terminalEval } from '../analysis/analyzeGame';
import type { PositionEval } from '../analysis/types';
import { liveStatusStore } from '../../state/liveStatus';
import { Engine, browserWorkerFactory, type SearchOptions } from './engine';

let engine: Engine | null = null;

export function getEngine(): Engine {
  if (!engine) engine = new Engine(browserWorkerFactory);
  return engine;
}

export class FairPlayBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FairPlayBlockedError';
  }
}

/** Throws FairPlayBlockedError if the gate refuses this context. */
export function assertAllowed(ctx: AnalysisContext) {
  const decision = checkAnalysis(ctx, liveStatusStore.get());
  if (!decision.allowed) throw new FairPlayBlockedError(decision.reason);
}

const memoryCache = new Map<string, PositionEval>();

/**
 * Evaluates a position through the fair-play gate, using the memory and
 * IndexedDB caches before asking the engine.
 */
export async function evaluatePosition(
  fen: string,
  ctx: AnalysisContext,
  opts: { depth: number; multiPv?: number; signal?: AbortSignal; onInfo?: SearchOptions['onInfo'] },
): Promise<PositionEval> {
  assertAllowed(ctx);
  const terminal = terminalEval(fen);
  if (terminal) return terminal;
  const multiPv = opts.multiPv ?? 1;
  const key = `${fen}|${opts.depth}|${multiPv}`;
  const mem = memoryCache.get(key);
  if (mem) return mem;
  try {
    const cached = await getCachedEval(fen, opts.depth, multiPv);
    if (cached) {
      const { key: _k, at: _a, ...rest } = cached;
      const value = { ...rest, fen };
      memoryCache.set(key, value);
      return value;
    }
  } catch {
    /* cache unavailable; fall through to engine */
  }
  const result = await getEngine().search(fen, {
    depth: opts.depth,
    multiPv,
    signal: opts.signal,
    onInfo: opts.onInfo,
  });
  // Re-check after the search in case a live game started meanwhile.
  assertAllowed(ctx);
  const pe = toPositionEval(fen, result);
  memoryCache.set(key, pe);
  if (memoryCache.size > 2000) memoryCache.delete(memoryCache.keys().next().value as string);
  putCachedEval(pe, opts.depth, multiPv).catch(() => undefined);
  return pe;
}

/** Engine move for practice opponents (strength-limited). Gated like analysis. */
export async function engineMove(
  fen: string,
  opts: { skillLevel: number; movetime?: number; depth?: number; signal?: AbortSignal },
): Promise<string | null> {
  assertAllowed({ kind: 'training', fen });
  const r = await getEngine().search(fen, {
    skillLevel: opts.skillLevel,
    movetime: opts.movetime,
    depth: opts.depth,
    multiPv: 1,
    signal: opts.signal,
  });
  assertAllowed({ kind: 'training', fen });
  return r.bestMove;
}
