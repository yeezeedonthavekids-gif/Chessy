// Copies the Stockfish WASM build from node_modules into public/engine so Vite
// can serve it as a static Web Worker. Runs automatically after `npm install`.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'src');
const dest = join(root, 'public', 'engine');

// Single-threaded "lite" build: embedded small NNUE (~7 MB), no SharedArrayBuffer
// or cross-origin isolation headers required, so it runs on any static host.
const files = [
  ['stockfish-17.1-lite-single-03e3232.js', 'stockfish.js'],
  ['stockfish-17.1-lite-single-03e3232.wasm', 'stockfish.wasm'],
];

if (!existsSync(src)) {
  console.warn('[copy-engine] stockfish package not found; skipping. Run `npm install`.');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const [from, to] of files) {
  copyFileSync(join(src, from), join(dest, to));
}
console.log(`[copy-engine] Stockfish 17.1 lite (single-threaded) copied to ${dest}`);
