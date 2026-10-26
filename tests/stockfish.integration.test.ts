import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Engine, type EngineWorker } from '../src/lib/engine/engine';
import { analyzeGame, toPositionEval } from '../src/lib/analysis/analyzeGame';
import { parseGame } from '../src/lib/chess/pgn';

const ENGINE = join(process.cwd(), 'public', 'engine', 'stockfish.js');

/** Runs the same WASM build the browser uses, via Node, behind the EngineWorker interface. */
function nodeWorker(): EngineWorker {
  const dir = mkdtempSync(join(tmpdir(), 'chessy-sf-test-'));
  copyFileSync(ENGINE, join(dir, 'stockfish.cjs'));
  copyFileSync(ENGINE.replace(/\.js$/, '.wasm'), join(dir, 'stockfish.wasm'));
  const proc = spawn(process.execPath, [join(dir, 'stockfish.cjs')]);
  const w: EngineWorker = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => proc.stdin.write(`${m}\n`),
    terminate: () => proc.kill(),
  };
  let buf = '';
  proc.stdout.on('data', (d: Buffer) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) w.onmessage?.({ data: line });
    }
  });
  return w;
}

describe.skipIf(!existsSync(ENGINE))('real Stockfish 17.1 (WASM in Node)', () => {
  it('finds a mate in one and powers a full game analysis', async () => {
    const engine = new Engine(nodeWorker);
    try {
      const r = await engine.search('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', { depth: 10, multiPv: 2 });
      expect(r.bestMove).toBe('d1d8');
      expect(r.lines[0].mate).toBe(1);
      expect(r.lines).toHaveLength(2);

      const game = { ...parseGame('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1'), id: 'fools' };
      const a = await analyzeGame(game, {
        depth: 8,
        engineName: engine.name,
        evaluate: async (fen, signal) => toPositionEval(fen, await engine.search(fen, { depth: 8, multiPv: 2, signal })),
      });
      expect(engine.name).toMatch(/Stockfish/);
      expect(a.moves[2].classification).toBe('blunder');
      expect(a.moves[2].motifs).toContain('allowed-mate');
      expect(a.moves[3].san).toBe('Qh4#');
    } finally {
      engine.terminate();
    }
  }, 60000);
});
