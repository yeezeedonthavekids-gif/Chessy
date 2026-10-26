// Builds src/data/openings.json from the lichess-org/chess-openings dataset
// (CC0 public domain: https://github.com/lichess-org/chess-openings).
// Each entry stores the ECO code, name, SAN move list and the resulting EPD
// (FEN without move counters) so positions can be matched by transposition.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'openings.json');

const entries = [];
for (const file of ['a', 'b', 'c', 'd', 'e']) {
  const res = await fetch(`${BASE}${file}.tsv`);
  if (!res.ok) throw new Error(`Failed to download ${file}.tsv: ${res.status}`);
  const lines = (await res.text()).trim().split('\n').slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history();
    const epd = chess.fen().split(' ').slice(0, 4).join(' ');
    entries.push({ eco, name, moves: moves.join(' '), epd });
  }
}
writeFileSync(out, JSON.stringify({ source: 'lichess-org/chess-openings (CC0)', entries }));
console.log(`Wrote ${entries.length} openings to ${out}`);
