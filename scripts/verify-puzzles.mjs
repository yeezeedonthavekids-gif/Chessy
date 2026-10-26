// Verifies every candidate puzzle/drill with Stockfish and writes
// src/data/puzzles.json. Run with `npm run verify:puzzles`.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { drills, tactics } from './puzzle-sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPTH = Number(process.env.DEPTH ?? 18);

function startEngine() {
  // The engine script is CommonJS; copy it next to its wasm with a .cjs extension.
  const dir = mkdtempSync(join(tmpdir(), 'chessy-sf-'));
  copyFileSync(join(root, 'public/engine/stockfish.js'), join(dir, 'stockfish.cjs'));
  copyFileSync(join(root, 'public/engine/stockfish.wasm'), join(dir, 'stockfish.wasm'));
  const proc = spawn(process.execPath, [join(dir, 'stockfish.cjs')]);
  let buf = '';
  const waiters = [];
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      waiters.forEach((w) => w(line));
    }
  });
  const send = (c) => proc.stdin.write(c + '\n');
  const until = (pred) =>
    new Promise((resolve) => {
      const lines = [];
      const w = (line) => {
        lines.push(line);
        if (pred(line)) {
          waiters.splice(waiters.indexOf(w), 1);
          resolve(lines);
        }
      };
      waiters.push(w);
    });
  return {
    async init() {
      send('uci');
      await until((l) => l === 'uciok');
      send('setoption name MultiPV value 2');
      send('isready');
      await until((l) => l === 'readyok');
    },
    async analyse(fen) {
      send(`position fen ${fen}`);
      send(`go depth ${DEPTH}`);
      const lines = await until((l) => l.startsWith('bestmove'));
      const best = {};
      for (const l of lines) {
        const m = l.match(/ multipv (\d+) score (cp|mate) (-?\d+).* pv (.+)$/);
        if (m && !/bound/.test(l)) best[m[1]] = { kind: m[2], value: Number(m[3]), pv: m[4].split(' ') };
      }
      return { lines: [best[1], best[2]].filter(Boolean), bestmove: lines.at(-1).split(' ')[1] };
    },
    quit() {
      send('quit');
      proc.kill();
    },
  };
}

const chances = (l) => (l.kind === 'mate' ? (l.value > 0 ? 1 : -1) : 2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, l.value)))) - 1);
const uciOf = (m) => m.from + m.to + (m.promotion ?? '');

const engine = startEngine();
await engine.init();
const verified = [];
const rejected = [];

for (const p of tactics) {
  const chess = new Chess(p.fen);
  if (p.setup) chess.loadPgn(p.setup);
  const fen = chess.fen();
  const moves = [];
  let ok = true;
  let reason = '';
  for (let i = 0; i < p.user.length; i++) {
    const pos = chess.fen();
    let played;
    try {
      // A step may list alternatives when the finish depends on the defence.
      const options = Array.isArray(p.user[i]) ? p.user[i] : [p.user[i]];
      for (const san of options) {
        try {
          const m = chess.move(san);
          // Prefer the alternative that matches the annotation (e.g. delivers mate).
          if (options.length > 1 && san.endsWith('#') && !m.san.endsWith('#')) {
            chess.undo();
            continue;
          }
          played = m;
          break;
        } catch {
          /* try the next alternative */
        }
      }
      if (!played) throw new Error('illegal');
    } catch {
      ok = false;
      reason = `illegal user move ${p.user[i]}`;
      break;
    }
    const a = await engine.analyse(pos);
    const [l1, l2] = a.lines;
    const isMate = played.san.endsWith('#');
    if (!isMate && a.bestmove !== uciOf(played)) {
      // Accept if the solution is as strong as the engine's choice (e.g., equally fast mate).
      const sameMate = l1.kind === 'mate' && l1.value > 0;
      if (!sameMate) {
        ok = false;
        reason = `engine prefers ${a.bestmove} over ${played.san}`;
        break;
      }
    }
    if (!isMate && l2 && chances(l1) - chances(l2) < 0.3 && !(l1.kind === 'mate' && l2.kind !== 'mate')) {
      const bothMate = l1.kind === 'mate' && l2.kind === 'mate' && l1.value > 0 && l2.value > 0 && l2.value > l1.value;
      if (!bothMate) {
        ok = false;
        reason = `not unique at ${played.san} (2nd line too close)`;
        break;
      }
    }
    moves.push(uciOf(played));
    if (i < p.user.length - 1) {
      if (chess.isGameOver()) {
        ok = false;
        reason = 'game over before solution finished';
        break;
      }
      const reply = await engine.analyse(chess.fen());
      const r = chess.move({ from: reply.bestmove.slice(0, 2), to: reply.bestmove.slice(2, 4), promotion: reply.bestmove[4] });
      moves.push(uciOf(r));
    }
  }
  if (ok && p.themes.some((t) => t.startsWith('mate')) && !chess.isCheckmate()) {
    ok = false;
    reason = 'mate puzzle does not end in mate';
  }
  if (ok) {
    verified.push({ id: p.id, kind: 'tactic', title: p.title, fen, moves, themes: p.themes, rating: p.rating });
    console.log(`✓ ${p.id}`);
  } else {
    rejected.push(p.id);
    console.log(`✗ ${p.id}: ${reason}`);
  }
}

for (const d of drills) {
  const a = await engine.analyse(d.fen);
  const l = a.lines[0];
  const stm = d.fen.split(' ')[1];
  // Convert to White POV then to the solver's POV (solver is the side to move).
  const solverCh = chances(l);
  const ok = d.expect === 'win' ? solverCh > 0.6 : Math.abs(solverCh) < 0.25;
  if (ok) {
    verified.push({ id: d.id, kind: 'drill', title: d.title, fen: d.fen, moves: [], themes: d.themes, rating: d.rating, goal: d.goal, maxMoves: d.maxMoves, tip: d.tip, solver: stm });
    console.log(`✓ ${d.id} (${l.kind} ${l.value})`);
  } else {
    rejected.push(d.id);
    console.log(`✗ ${d.id}: eval ${l.kind} ${l.value} does not match expected ${d.expect}`);
  }
}

engine.quit();
writeFileSync(
  join(root, 'src/data/puzzles.json'),
  JSON.stringify({ verifiedWith: `Stockfish 17.1 lite, depth ${DEPTH}, MultiPV 2`, puzzles: verified }, null, 1),
);
console.log(`\n${verified.length} verified, ${rejected.length} rejected${rejected.length ? ': ' + rejected.join(', ') : ''}`);
