import { describe, expect, it, vi } from 'vitest';
import { AbortError, Engine, EngineError, type EngineWorker } from '../src/lib/engine/engine';

/** Scriptable fake of the Stockfish worker's UCI conversation. */
class FakeWorker implements EngineWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: string[] = [];
  searching = false;
  constructor(private opts: { respond?: boolean; holdSearch?: boolean } = {}) {}
  private emit(line: string) {
    queueMicrotask(() => this.onmessage?.({ data: line }));
  }
  postMessage(cmd: string) {
    this.sent.push(cmd);
    if (this.opts.respond === false) return;
    if (cmd === 'uci') {
      this.emit('id name Stockfish 17.1 Lite');
      this.emit('uciok');
    } else if (cmd === 'isready') this.emit('readyok');
    else if (cmd.startsWith('go')) {
      this.searching = true;
      this.emit('info depth 1 seldepth 1 multipv 1 score cp 20 nodes 20 pv e2e4');
      this.emit('info depth 10 seldepth 12 multipv 1 score cp 35 nodes 2000 pv e2e4 e7e5');
      this.emit('info depth 10 seldepth 12 multipv 2 score cp 20 nodes 2000 pv d2d4 d7d5');
      if (!this.opts.holdSearch) this.finish();
    } else if (cmd === 'stop' && this.searching) this.finish();
  }
  finish() {
    this.searching = false;
    this.emit('bestmove e2e4 ponder e7e5');
  }
  terminate() {}
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('Engine (UCI over a worker)', () => {
  it('initialises with uci/isready and reports the engine name', async () => {
    const w = new FakeWorker();
    const e = new Engine(() => w);
    await e.init();
    expect(w.sent.slice(0, 1)).toEqual(['uci']);
    expect(w.sent).toContain('isready');
    expect(e.name).toBe('Stockfish 17.1 Lite');
  });

  it('runs a search and returns sorted multi-PV lines', async () => {
    const w = new FakeWorker();
    const e = new Engine(() => w);
    const r = await e.search(START, { depth: 10, multiPv: 2 });
    expect(w.sent).toContain(`position fen ${START}`);
    expect(w.sent).toContain('setoption name MultiPV value 2');
    expect(w.sent).toContain('go depth 10');
    expect(r.bestMove).toBe('e2e4');
    expect(r.depth).toBe(10);
    expect(r.lines.map((l) => [l.multipv, l.cp, l.pv[0]])).toEqual([
      [1, 35, 'e2e4'],
      [2, 20, 'd2d4'],
    ]);
  });

  it('streams intermediate info to onInfo', async () => {
    const e = new Engine(() => new FakeWorker());
    const onInfo = vi.fn();
    await e.search(START, { depth: 10, onInfo });
    expect(onInfo).toHaveBeenCalled();
  });

  it('serialises concurrent searches', async () => {
    const w = new FakeWorker();
    const e = new Engine(() => w);
    const [a, b] = await Promise.all([e.search(START, { depth: 5 }), e.search(START, { depth: 6 })]);
    expect(a.bestMove).toBe('e2e4');
    expect(b.bestMove).toBe('e2e4');
    const gos = w.sent.filter((c) => c.startsWith('go'));
    expect(gos).toEqual(['go depth 5', 'go depth 6']);
  });

  it('cancels a running search with stop and rejects with AbortError', async () => {
    const w = new FakeWorker({ holdSearch: true });
    const e = new Engine(() => w);
    const ac = new AbortController();
    const p = e.search(START, { depth: 30, signal: ac.signal });
    await new Promise((r) => setTimeout(r, 10));
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(w.sent).toContain('stop');
  });

  it('rejects immediately for an already-aborted signal', async () => {
    const e = new Engine(() => new FakeWorker());
    const ac = new AbortController();
    ac.abort();
    await expect(e.search(START, { signal: ac.signal })).rejects.toBeInstanceOf(AbortError);
  });

  it('reports worker construction failures as EngineError', async () => {
    const e = new Engine(() => {
      throw new Error('no wasm');
    });
    await expect(e.search(START)).rejects.toBeInstanceOf(EngineError);
  });

  it('times out when the engine never answers', async () => {
    vi.useFakeTimers();
    const e = new Engine(() => new FakeWorker({ respond: false }));
    const p = e.init();
    vi.advanceTimersByTime(21000);
    await expect(p).rejects.toThrow(/did not respond/);
    vi.useRealTimers();
  });
});
