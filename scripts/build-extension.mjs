// Finishes the Chrome extension build: copies the manifest, background worker
// and icons into dist-extension/ next to the Vite output, and stamps the
// package version into the manifest. Load dist-extension/ with
// chrome://extensions → "Load unpacked".
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'extension');
const out = join(root, 'dist-extension');

if (!existsSync(join(out, 'index.html'))) {
  console.error('[build-extension] dist-extension/index.html missing — run `vite build --mode extension` first.');
  process.exit(1);
}
if (!existsSync(join(out, 'engine', 'stockfish.wasm'))) {
  console.error('[build-extension] Stockfish engine missing from the build — run `npm install` (it copies the engine to public/engine).');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
manifest.version = version;
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
copyFileSync(join(src, 'background.js'), join(out, 'background.js'));
mkdirSync(join(out, 'icons'), { recursive: true });
for (const f of readdirSync(join(src, 'icons'))) copyFileSync(join(src, 'icons', f), join(out, 'icons', f));

console.log(`[build-extension] Chessy ${version} ready in ${out}`);
