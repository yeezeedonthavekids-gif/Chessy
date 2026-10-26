# Chessy 🧀

**A free, local-first chess coach.** Review your completed Chess.com, Lichess and over-the-board games with Stockfish running in your browser, understand your mistakes, drill tactics and endgames, build an opening repertoire, and track how you improve.

- **Free:** Stockfish 17.1 runs locally as WebAssembly. No paid analysis API, no account, no server.
- **Private:** games, analyses and training history stay in your browser (IndexedDB). Export or delete them at any time.
- **Fair play by design:** Chessy is a separate app for completed games and standalone training positions. It never looks at, overlays or interacts with a game in progress (see [Fair play](#fair-play)).

---

## Contents

- [Quick start](#quick-start)
- [Chrome extension](#chrome-extension)
- [Features](#features)
- [Fair play](#fair-play)
- [Chess.com and Lichess integration](#chesscom-and-lichess-integration)
- [Engine setup](#engine-setup)
- [AI coach configuration (optional)](#ai-coach-configuration-optional)
- [Development](#development)
- [Architecture](#architecture)
- [Data sources and licences](#data-sources-and-licences)
- [Known limitations](#known-limitations)

---

## Quick start

Requirements: **Node.js 18+** (tested on 22) and a modern browser with WebAssembly and Web Worker support (all current Chrome, Edge, Firefox and Safari releases).

```bash
npm install        # also copies the Stockfish WASM build into public/engine/
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # type-checks, then bundles to dist/
npm run preview    # serves dist/ at http://localhost:4173
```

`dist/` is a static site. Host it anywhere that serves static files (GitHub Pages, Netlify, Cloudflare Pages, nginx…). The app uses client-side routing, so configure your host to serve `index.html` for unknown paths (an "SPA fallback").

## Chrome extension

Chessy also ships as a Chrome (Manifest V3) extension. It is the same app, opened in its own tab when you click the cheese icon in the toolbar.

```bash
npm install
npm run build:extension    # outputs dist-extension/
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist-extension` folder.
4. Pin Chessy from the puzzle-piece menu, then click the cheese icon to open it.

Chessy opens automatically once after installation. After pulling new code, run `npm run build:extension` again and click the reload button on the Chessy card in `chrome://extensions`.

**Fair play in the extension.** It is a launcher only:

- it requests **no permissions**, no host permissions and no content scripts, so it cannot read, overlay or modify Chess.com, Lichess or any other website;
- the background worker only opens Chessy's own page;
- `tests/extension.test.ts` fails the build if the manifest ever gains page access.

Everything else behaves exactly like the web app, including the fair-play gate and the "I'm about to play" lock.

Notes:

- Extension pages keep their own storage. Games you imported in the web app aren't visible in the extension, and vice versa. To move them, use **Settings → Export all data** in one and **Import data** in the other.
- If you use a local model server for the AI coach, allow the extension's origin, e.g. `OLLAMA_ORIGINS=chrome-extension://*`.
- To publish on the Chrome Web Store, zip the *contents* of `dist-extension/` (with `manifest.json` at the top level of the zip) and upload it in the developer dashboard.

## Features

| Area | What you get |
| --- | --- |
| **Analyze Game** | Paste or upload PGN (multi-game files supported), or open an imported game. Full-game Stockfish review with adjustable depth (10–22), per-move classification (best, excellent, good, inaccuracy, mistake, blunder, only move, forced, book), accuracy and average centipawn loss for each side, an evaluation graph, an evaluation bar, live multi-PV engine lines, the best continuation, and variation exploration by dragging pieces. Keyboard: <kbd>←</kbd> <kbd>→</kbd> <kbd>Home</kbd> <kbd>End</kbd> <kbd>F</kbd>. |
| **Move explanations** | Each move gets engine facts (evaluation before and after, winning chances, best line, expected reply), a plain-language coach explanation, and detected patterns (missed mate, allowed mate, hung piece, missed or allowed fork, missed material, missed win, opening-principle violations, endgame errors, time-pressure errors). |
| **My Games** | Search and filter by result or source, delete games, and batch-analyze every unanalyzed game. |
| **AI Coach** | Chat about a specific move of an analyzed game, your recurring weaknesses, a training plan, positional chess, attacking the castled king, endgames and more. It runs interactive lessons with quizzes, and in-chat tactics quizzes that ask questions before revealing anything. It remembers completed lessons and quiz results locally, and you can make it forget them. **Works fully offline without an API key.** |
| **Practice** | Tactics and mate puzzles (built-in, plus puzzles generated from *your own* mistakes), endgame drills played against Stockfish (queen mate, rook mate, king-and-pawn, Lucena, Philidor), "Guess the move" through classic games, a candidate-moves exercise, an opening quiz (named openings or your repertoire), and a practice board where you play any position against an adjustable-strength engine. Hints get progressively more specific; answers are revealed only after you commit to a move. |
| **Openings** | ECO explorer (3,865 named lines, recognised even when moves transpose), a known-continuations table, optional Lichess opening statistics (online, with the source shown), a White/Black repertoire with notes and PGN/JSON import and export, nine classic traps, and opening principles. |
| **Progress** | Win/draw/loss overall and by colour, results per opening, accuracy trend, centipawn loss by game phase, blunders and mistakes per game, endgame conversion and defence, and time management (from `[%clk]` data). A personal report covers your top three recurring weaknesses with examples linked to the exact move, plus exercises, study topics and a weekly plan. |
| **Settings** | Usernames, skill level (adapts explanations and puzzle difficulty), default depth, dark/light/system theme, board colours, an optional AI provider, and data export or deletion. |

Every coach answer labels where its content came from:

- **Engine-verified · Stockfish:** evaluations and lines calculated by the engine.
- **Coach explanation:** Chessy's rule-based teaching text.
- **Pattern detection · heuristic:** detected motifs. These are heuristics, so treat them as hints, not verdicts.
- **AI explanation · not engine-verified:** text from an optional language model. Any move it mentions that is neither legal in the position nor in the engine lines is flagged.

## Fair play

**Chessy must never help anyone cheat.** The safest design is an independent app that does not touch online games at all, and that is how Chessy is built:

1. **No browser extension, no overlay, no page injection.** Chessy never reads a live board, never automates moves and never interacts with Chess.com or Lichess game pages or controls. It only uses the platforms' documented public read-only APIs for *finished* games and public status.
2. **Completed games only.** An imported game is analyzable only if it has a final result (`1-0`, `0-1`, `1/2-1/2`) or ends in a terminal position. Games with result `*` are stored, but every engine feature stays locked for them until you re-import the finished game.
3. **One gate for every engine request.** All analysis, hints, evaluations, best-move arrows, puzzle checking and practice-engine moves go through `src/lib/fairplay/gate.ts`. It locks **everything** when:
   - **Lichess** reports that you are currently playing. Chessy polls the public `GET /api/users/status?ids=<you>` endpoint once a minute while the tab is visible (when your Lichess username is set and "Pause engine features while I'm playing" is on).
   - you press **"I'm about to play"** (30 or 90 minutes). Use this before live games on Chess.com, which does not publish live-game status.
4. **Ongoing Chess.com daily games are refused.** Chessy loads every position of your ongoing daily games from the public `GET /pub/player/<you>/games` endpoint and refuses to analyze any training position that matches one of them (move counters are ignored when comparing).
5. **The practice room is isolated.** Training positions are separate from imported games and from any online match.
6. **No guarantees.** Chessy cannot see games played under accounts it doesn't know about, and it cannot detect Chess.com live games automatically. Using Chessy does **not** guarantee that a platform won't take action against an account. Follow each site's fair-play policy: don't use any assistance during a game.

## Chess.com and Lichess integration

| | Chess.com | Lichess |
| --- | --- | --- |
| API | [Published-Data API](https://www.chess.com/news/view/published-data-api) (public, read-only) | [Lichess API](https://lichess.org/api) (public endpoints) |
| Import | `GET /pub/player/{user}/games/archives`, then monthly archives, newest first. Only finished games appear in archives; variants are skipped. | `GET /api/games/user/{user}?finished=true&ongoing=false&clocks=true&opening=true` as PGN |
| Live-status check | Ongoing **daily** game positions (`/pub/player/{user}/games`) | `GET /api/users/status?ids={user}` (`playing` flag) |
| Authentication | None. Chessy never asks for passwords. | None needed. An optional personal token is supported by the client code for higher rate limits. |
| Rate limits | Requests are sequential; on HTTP 429 Chessy waits `Retry-After` (or 60 s) and retries once. | Same |

You can always skip the APIs: export PGN from either site and paste or upload it.

> **Verification note.** The network that this version was developed in could not reach `api.chess.com` or `lichess.org`. The API clients are implemented against the documented endpoints and covered by unit tests with mocked responses (`tests/import.test.ts`), but they have not been exercised against the live services yet. PGN import works without network access.

## Engine setup

`npm install` runs `scripts/copy-engine.mjs`, which copies **Stockfish 17.1 "lite", single-threaded** (`stockfish@17.1.0` on npm, about 7 MB including its embedded NNUE network) to `public/engine/stockfish.{js,wasm}`. This build:

- runs in a dedicated Web Worker, so the UI never blocks;
- needs **no** `SharedArrayBuffer` or cross-origin-isolation headers, so it works on any static host;
- caches evaluations in IndexedDB (keyed by position, depth and MultiPV), so re-analysis is instant.

If the engine fails to load (no WebAssembly or Worker support, or a blocked file), Chessy shows a clear error and everything that doesn't need the engine keeps working. To use a different build, change the file names in `scripts/copy-engine.mjs`; `src/lib/engine/engine.ts` speaks plain UCI.

Analysis depth: depth 10 is fast (about 1–2 s per game on a laptop), 14 is the default, and 18–22 are slower but more precise. Navigating away or pressing *Cancel* stops the search immediately (`stop` is sent to the engine).

## AI coach configuration (optional)

The built-in coach needs **no key and no internet**. For free-form conversation you can optionally connect a model in **Settings → AI coach**:

| Provider | Cost | Notes |
| --- | --- | --- |
| **None (default)** | Free | Offline, rule-based coach. Engine facts come from local Stockfish. |
| **Local model via an OpenAI-compatible server** | Free (runs on your machine) | For example [Ollama](https://ollama.com) (`http://localhost:11434/v1`, model e.g. `llama3.1`) or LM Studio. The server must allow requests from Chessy's origin. For Ollama, set `OLLAMA_ORIGINS=http://localhost:5173` (or your deployed origin). |
| **Anthropic Claude** | **Paid by you.** Usage is billed by Anthropic to the key's owner. | Default model `claude-opus-5-5` (editable). Requests go straight from your browser to Anthropic using the official SDK with browser access enabled. Refusal fallback is enabled (`fallbacks: "default"`), so a declined request is retried on a suitable model server-side. The SDK is only downloaded once you send an AI request. |

Key handling:

- **No key is ever embedded in the app.** Chessy has no server, so a developer key could never be kept secret client-side.
- Your key is stored only in this browser: in `sessionStorage` by default (forgotten when the tab closes), or in `localStorage` if you tick *Remember*. It is never included in data exports.
- The model only receives engine facts computed locally, rule-based board observations, your stats summary and your question. The system prompt forbids inventing moves and forbids help with games in progress, and the fair-play gate removes all position data while a lock is active.

## Development

```bash
npm run dev              # Vite dev server
npm test                 # Vitest: unit, workflow and real-engine integration tests
npm run typecheck        # tsc --noEmit
npm run build            # type-check + production bundle
npm run build:extension  # Chrome extension bundle in dist-extension/
npm run verify:puzzles   # re-verify built-in puzzles with Stockfish (writes src/data/puzzles.json)
npm run data:openings    # rebuild src/data/openings.json from lichess-org/chess-openings
```

### Tests

`tests/` covers:

- PGN parsing: headers, clocks, custom FENs, multi-game files, malformed input, castling and promotion in UCI form;
- legal moves and game status: checkmate, stalemate, insufficient material;
- position heuristics: material, phases, hanging pieces, forks;
- UCI parsing, plus **engine communication** with a scripted fake worker (initialisation, MultiPV, queueing, cancellation, timeouts, load failures);
- the **analysis workflow**: classification thresholds, accuracy, motif detection, clocks and increments, book moves, cancellation;
- the **fair-play gate** and the Chess.com and Lichess clients (mocked `fetch`, including 429 retry);
- stats, weaknesses and the weekly plan; puzzles and hints; coach intents, explanations and verification of AI text; IndexedDB storage; opening data, traps and repertoire import/export;
- an **integration test that runs the real Stockfish WASM build** (via Node) through the same `Engine` class and analyzes a game end to end.

### Built-in puzzles

`scripts/puzzle-sources.mjs` lists candidate positions, including finishes from public-domain games (Morphy's Opera Game, the Immortal and Evergreen games, Réti–Tartakower, Légal's mate). `npm run verify:puzzles` checks each one with Stockfish (depth 18, MultiPV 2): the solution must be the engine's choice and clearly better than the alternatives, mate puzzles must end in mate, and drills must have the expected evaluation. Only passing positions are written to `src/data/puzzles.json`. Six of the first candidates were rejected this way and then fixed.

## Architecture

```
src/
  lib/
    chess/        PGN parsing (chess.js), notation helpers, position heuristics
    engine/       UCI parser, Engine (queue/cancel/timeout over a Worker), gated evaluation service + cache
    analysis/     winning-chance model, classification, motif detection, full-game analyzer, runner
    fairplay/     the gate every engine request passes through
    import/       Chess.com + Lichess clients, PGN → stored game, polite rate limiting
    coach/        position features, lessons, offline coach, explanations, LLM client, AI-text verification
    practice/     puzzles, hints, own-game puzzle generation
    openings/     ECO explorer, repertoire import/export
    stats/        analytics, weaknesses, weekly plan
    storage/      IndexedDB (idb): games, analyses, eval cache, repertoire, attempts, coach memory
  state/          tiny stores (settings, live status, data) built on useSyncExternalStore
  components/     board, eval bar/graph, move list, trainers, coach blocks, charts, layout
  pages/          Dashboard, Analyze, My Games, AI Coach, Practice, Openings, Progress, Settings
  data/           openings.json (ECO), puzzles.json (verified), classic games, traps
```

Stack: TypeScript, React 18, Vite 5, react-router 6, chess.js 1.4 (rules and PGN), react-chessboard 4, Stockfish 17.1 WASM, idb, Vitest. There is no backend.

Design notes:

- Move classification follows Lichess's winning-chances model: an inaccuracy, mistake or blunder means losing ≥ 0.1, 0.2 or 0.3 of winning chances on a [−1, 1] scale. Accuracy uses Lichess's per-move formula. Mates are converted to ±1 winning chance (±1000 cp for averages).
- "Only move" requires MultiPV 2: you played the best move, and the second-best move is ≥ 0.3 winning chances worse.
- Puzzles generated from your own games use only positions where the best move beats the alternatives by ≥ 0.25 winning chances, so each has one clear answer.
- The weakness report requires at least 5 analyzed games with your colour known. Chessy never estimates your rating.

## Data sources and licences

- **Stockfish 17.1** (WASM build by Chess.com / nmrugg): GPL-3.0. Because the app distributes it, Chessy is licensed **GPL-3.0-or-later**.
- **Opening names and ECO codes:** [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0.
- **Optional opening statistics:** the Lichess opening explorer (`explorer.lichess.ovh`), fetched only on request. The source is shown next to the numbers.
- **Classic games** used in puzzles and "Guess the move" are 19th and early-20th century games in the public domain.
- Piece set: the react-chessboard default pieces (MIT).

## Known limitations

- The Chess.com and Lichess API clients are unit-tested against documented response shapes but were not verified against the live APIs from the development environment (no network access to those hosts).
- Chess.com live (real-time) games cannot be detected through the public API. Use the "I'm about to play" button.
- The Lichess opening explorer may require authentication for anonymous requests. If it returns 401, Chessy shows the error; the ECO explorer works offline either way.
- The built-in puzzle set is small (17 tactics and 6 drills) because every position is engine-verified. Most training value comes from puzzles generated from your own analyzed games.
- Motif detection is heuristic and labelled as such. Engine evaluations from the "lite" network at modest depth are strong but not infallible.
- The single-threaded engine is slower than native Stockfish. Very deep full-game reviews (depth 22) can take minutes.
