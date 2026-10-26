import { parseBestMove, parseInfo, type EngineLine } from './uci';

/** Minimal worker surface we depend on, so tests can provide a fake. */
export interface EngineWorker {
  postMessage(message: string): void;
  terminate(): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type WorkerFactory = () => EngineWorker;

export interface SearchOptions {
  depth?: number;
  movetime?: number;
  multiPv?: number;
  /** Optional strength limit (0-20) for practice opponents. */
  skillLevel?: number;
  signal?: AbortSignal;
  onInfo?: (lines: EngineLine[]) => void;
}

export interface SearchResult {
  fen: string;
  depth: number;
  lines: EngineLine[];
  bestMove: string | null;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

export class AbortError extends Error {
  constructor() {
    super('Analysis cancelled');
    this.name = 'AbortError';
  }
}

interface Pending {
  fen: string;
  opts: SearchOptions;
  resolve: (r: SearchResult) => void;
  reject: (e: Error) => void;
}

const INIT_TIMEOUT_MS = 20000;

/**
 * Serialises UCI searches over a single Stockfish worker. Each `search()` call
 * is queued; aborting a running search sends `stop` and rejects with AbortError
 * once the engine has acknowledged with `bestmove`.
 */
export class Engine {
  private worker: EngineWorker | null = null;
  private ready: Promise<void> | null = null;
  private listeners = new Set<(line: string) => void>();
  private queue: Pending[] = [];
  private running = false;
  private currentMultiPv = 1;
  private currentSkill = 20;
  name = 'Stockfish';

  constructor(private readonly factory: WorkerFactory) {}

  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      let worker: EngineWorker;
      try {
        worker = this.factory();
      } catch (e) {
        reject(new EngineError(`Could not start the engine worker: ${(e as Error).message}`));
        return;
      }
      this.worker = worker;
      const timer = setTimeout(() => {
        reject(new EngineError('The engine did not respond in time. Your browser may not support WebAssembly workers.'));
      }, INIT_TIMEOUT_MS);
      worker.onerror = (ev) => {
        clearTimeout(timer);
        const msg = (ev as { message?: string })?.message ?? 'unknown error';
        reject(new EngineError(`Engine failed to load: ${msg}`));
      };
      worker.onmessage = (ev) => {
        const text = String(ev.data);
        for (const line of text.split('\n')) {
          if (line) this.listeners.forEach((l) => l(line));
        }
      };
      const onLine = (line: string) => {
        if (line.startsWith('id name')) this.name = line.slice(8).trim();
        if (line === 'uciok') {
          this.send('setoption name Hash value 32');
          this.send('isready');
        } else if (line === 'readyok') {
          clearTimeout(timer);
          this.listeners.delete(onLine);
          resolve();
        }
      };
      this.listeners.add(onLine);
      this.send('uci');
    });
    this.ready.catch(() => {
      this.ready = null;
      this.worker?.terminate();
      this.worker = null;
    });
    return this.ready;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  search(fen: string, opts: SearchOptions = {}): Promise<SearchResult> {
    if (opts.signal?.aborted) return Promise.reject(new AbortError());
    return new Promise<SearchResult>((resolve, reject) => {
      this.queue.push({ fen, opts, resolve, reject });
      void this.pump();
    });
  }

  private async pump() {
    if (this.running) return;
    const job = this.queue.shift();
    if (!job) return;
    this.running = true;
    try {
      await this.init();
      job.resolve(await this.run(job));
    } catch (e) {
      job.reject(e as Error);
    } finally {
      this.running = false;
      void this.pump();
    }
  }

  private run({ fen, opts }: Pending): Promise<SearchResult> {
    return new Promise<SearchResult>((resolve, reject) => {
      if (opts.signal?.aborted) {
        reject(new AbortError());
        return;
      }
      const multiPv = Math.max(1, Math.min(5, opts.multiPv ?? 1));
      const lines = new Map<number, EngineLine>();
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        this.send('stop');
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      const onLine = (line: string) => {
        const info = parseInfo(line);
        if (info) {
          if (info.bound) return;
          lines.set(info.multipv, {
            multipv: info.multipv,
            depth: info.depth,
            seldepth: info.seldepth,
            nodes: info.nodes,
            cp: info.cp,
            mate: info.mate,
            pv: info.pv,
          });
          opts.onInfo?.(sorted(lines));
          return;
        }
        const best = parseBestMove(line);
        if (best) {
          this.listeners.delete(onLine);
          opts.signal?.removeEventListener('abort', onAbort);
          if (aborted) {
            reject(new AbortError());
            return;
          }
          const all = sorted(lines);
          resolve({
            fen,
            depth: all[0]?.depth ?? 0,
            lines: all,
            bestMove: best.move,
          });
        }
      };
      this.listeners.add(onLine);
      if (multiPv !== this.currentMultiPv) {
        this.send(`setoption name MultiPV value ${multiPv}`);
        this.currentMultiPv = multiPv;
      }
      const skill = opts.skillLevel ?? 20;
      if (skill !== this.currentSkill) {
        this.send(`setoption name Skill Level value ${skill}`);
        this.currentSkill = skill;
      }
      this.send(`position fen ${fen}`);
      if (opts.movetime) this.send(`go movetime ${opts.movetime}`);
      else this.send(`go depth ${opts.depth ?? 16}`);
    });
  }

  /** Rejects all queued (not yet running) searches. */
  clearQueue() {
    const pending = this.queue.splice(0);
    pending.forEach((p) => p.reject(new AbortError()));
  }

  newGame() {
    this.send('ucinewgame');
  }

  terminate() {
    this.clearQueue();
    this.send('quit');
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}

function sorted(lines: Map<number, EngineLine>): EngineLine[] {
  return [...lines.values()].sort((a, b) => a.multipv - b.multipv);
}

/** Browser worker factory for the bundled Stockfish WASM build. */
export function browserWorkerFactory(): EngineWorker {
  if (typeof Worker === 'undefined') throw new EngineError('Web Workers are not supported in this browser.');
  if (typeof WebAssembly !== 'object') throw new EngineError('WebAssembly is not supported in this browser.');
  const base = import.meta.env.BASE_URL ?? '/';
  return new Worker(`${base}engine/stockfish.js`) as unknown as EngineWorker;
}
