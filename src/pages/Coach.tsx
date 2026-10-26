import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Board } from '../components/Board';
import { CoachBlocks } from '../components/CoachBlocks';
import { IconChevronLeft, IconChevronRight, IconSend, IconTrash } from '../components/Icons';
import { LessonView } from '../components/LessonView';
import { PuzzleTrainer } from '../components/PuzzleTrainer';
import { checkAnalysis } from '../lib/fairplay/gate';
import { LESSONS } from '../lib/coach/lessons';
import { DEFAULT_SUGGESTIONS, detectIntent, respond } from '../lib/coach/localCoach';
import type { ChatTurn } from '../lib/coach/llm';
import type { CoachAction, CoachBlock, CoachContext } from '../lib/coach/types';
import { unverifiedMoves } from '../lib/coach/verify';
import { BUILTIN_PUZZLES, LEVEL_MAX_RATING, puzzlesFromAnalyses, type Puzzle } from '../lib/practice/puzzles';
import { addMemory, clearMemory, listMemory, uid, type CoachMemoryEntry } from '../lib/storage/db';
import { computeStats } from '../lib/stats/aggregate';
import { dataStore } from '../state/data';
import { liveStatusStore } from '../state/liveStatus';
import { getApiKey, settingsStore } from '../state/settings';
import { createStore, useStore } from '../state/store';

interface Message {
  id: string;
  role: 'user' | 'coach';
  text?: string;
  blocks?: CoachBlock[];
  suggestions?: string[];
  pending?: boolean;
}

// Kept for the session so the conversation survives navigation.
const chatStore = createStore<Message[]>([]);

type Panel = { kind: 'context' } | { kind: 'quiz'; puzzle: Puzzle } | { kind: 'lesson'; lessonId: string };

export default function Coach() {
  const [params, setParams] = useSearchParams();
  const { games, analyses } = useStore(dataStore);
  const settings = useStore(settingsStore);
  const live = useStore(liveStatusStore);
  const messages = useStore(chatStore);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>({ kind: 'context' });
  const [memory, setMemory] = useState<CoachMemoryEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  const analyzedGames = games.filter((g) => analyses.has(g.id));
  const gameId = params.get('game') ?? '';
  const game = games.find((g) => g.id === gameId);
  const analysis = game ? analyses.get(game.id) : undefined;
  const ply = Math.max(0, Math.min(game?.plies.length ?? 0, Number(params.get('ply') ?? 0)));
  const fen = game ? (ply === 0 ? game.startFen : game.plies[ply - 1].fenAfter) : undefined;
  const stats = useMemo(() => computeStats(games, [...analyses.values()]), [games, analyses]);

  const gate = game ? checkAnalysis({ kind: 'completed-game', finished: game.finished, result: game.result }, live) : checkAnalysis({ kind: 'training', fen: fen ?? '8/8/8/8/8/8/8/K6k w - - 0 1' }, live);
  const ctx: CoachContext = { level: settings.skillLevel, game, analysis, ply, fen, stats, engineAllowed: gate.allowed, lockReason: gate.allowed ? undefined : gate.reason };

  useEffect(() => {
    void listMemory().then((m) => setMemory(m.reverse())).catch(() => undefined);
  }, [panel]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => abort.current?.abort(), []);

  const setPly = (p: number) => setParams({ game: gameId, ply: String(p) }, { replace: true });

  const runActions = (actions: CoachAction[] | undefined, text: string) => {
    for (const a of actions ?? []) {
      if (a.type === 'start-lesson') setPanel({ kind: 'lesson', lessonId: a.lessonId });
      if (a.type === 'start-quiz') {
        if (!gate.allowed) {
          chatStore.set((m) => [...m, { id: uid(), role: 'coach', blocks: [{ kind: 'warning', text: `${gate.reason} Quizzes come back when your game is over.` }] }]);
          continue;
        }
        const own = puzzlesFromAnalyses(games, [...analyses.values()]);
        let pool = [...own, ...BUILTIN_PUZZLES.filter((p) => p.kind === 'tactic' && (p.rating ?? 0) <= LEVEL_MAX_RATING[settings.skillLevel])];
        if (a.theme === 'mate') pool = pool.filter((p) => p.themes.some((t) => t.startsWith('mate')));
        if (a.theme === 'endgame') {
          setPanel({ kind: 'context' });
          chatStore.set((m) => [...m, { id: uid(), role: 'coach', blocks: [{ kind: 'text', source: 'coach', text: 'Endgame practice works best against the engine. Open Practice → Endgame drills — the queen mate, rook mate, opposition, Lucena and Philidor positions are all there.' }] }]);
          continue;
        }
        if (!pool.length) continue;
        const puzzle = pool[Math.floor(Math.random() * pool.length)];
        setPanel({ kind: 'quiz', puzzle });
      }
    }
    void text;
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    const userMsg: Message = { id: uid(), role: 'user', text: q };
    chatStore.set((m) => [...m, userMsg]);

    const intent = detectIntent(q);
    const useLlm = settings.aiProvider !== 'none' && !['quiz', 'lesson'].includes(intent);
    if (!useLlm) {
      const reply = respond(q, ctx);
      chatStore.set((m) => [...m, { id: uid(), role: 'coach', blocks: reply.blocks, suggestions: reply.suggestions }]);
      runActions(reply.actions, q);
      return;
    }

    // Optional LLM path: engine facts are computed locally and passed in; output is labelled and checked.
    setBusy(true);
    const id = uid();
    chatStore.set((m) => [...m, { id, role: 'coach', blocks: [{ kind: 'text', source: 'ai', text: '' }], pending: true }]);
    const history: ChatTurn[] = [...messages, userMsg]
      .filter((m) => !m.pending)
      .slice(-10)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text ?? (m.blocks ?? []).map((b) => ('text' in b ? b.text : 'lines' in b ? b.lines.join('\n') : '')).join('\n') }));
    abort.current = new AbortController();
    let acc = '';
    try {
      // Loaded on demand so the offline coach never downloads the AI SDK.
      const { streamCoachReply, engineSansInContext } = await import('../lib/coach/llm');
      const full = await streamCoachReply(settings, getApiKey(), history, ctx, (delta) => {
        acc += delta;
        chatStore.set((m) => m.map((x) => (x.id === id ? { ...x, blocks: [{ kind: 'text', source: 'ai', text: acc }] } : x)));
      }, abort.current.signal);
      const blocks: CoachBlock[] = [];
      // Show the verified engine facts the model was given, above its text.
      const local = respond(q, ctx).blocks.filter((b) => b.kind === 'engine');
      blocks.push(...local, { kind: 'text', source: 'ai', text: full || acc });
      const flagged = unverifiedMoves(full || acc, fen, engineSansInContext(ctx));
      if (flagged.length) {
        blocks.push({ kind: 'warning', text: `Not engine-verified: ${flagged.join(', ')} ${flagged.length === 1 ? 'is' : 'are'} neither legal here nor in the Stockfish lines above. Treat ${flagged.length === 1 ? 'it' : 'them'} with caution.` });
      }
      chatStore.set((m) => m.map((x) => (x.id === id ? { ...x, blocks, pending: false } : x)));
    } catch (e) {
      const fallback = respond(q, ctx);
      const msg = (e as Error).name === 'LlmError' ? (e as Error).message : (e as Error).name === 'AbortError' ? 'Cancelled.' : `AI request failed: ${(e as Error).message}`;
      chatStore.set((m) => m.map((x) => (x.id === id ? { ...x, pending: false, blocks: [{ kind: 'warning', text: `${msg} Here is the offline coach's answer instead.` }, ...fallback.blocks], suggestions: fallback.suggestions } : x)));
    } finally {
      setBusy(false);
    }
  };

  const providerLabel =
    settings.aiProvider === 'anthropic' ? `Claude (${settings.anthropicModel}) · your API key` : settings.aiProvider === 'openai-compatible' ? `Local model (${settings.openaiModel})` : 'Offline coach · free';
  const lesson = panel.kind === 'lesson' ? LESSONS.find((l) => l.id === panel.lessonId) : undefined;
  const shownSuggestions = messages.length ? messages[messages.length - 1].suggestions : DEFAULT_SUGGESTIONS;

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>AI Coach</h1>
          <p>Ask about your completed games, chess concepts, or start a lesson or quiz.</p>
        </div>
        <div className="row">
          <span className={`badge ${settings.aiProvider === 'none' ? 'green' : 'blue'}`}>{providerLabel}</span>
          <Link to="/settings" className="small">Change</Link>
        </div>
      </div>

      <div className="split-coach">
        <div className="card chat" style={{ height: 'calc(100vh - 170px)', minHeight: 480 }}>
          <div className="chat-log" ref={logRef}>
            {!messages.length && (
              <div className="msg coach">
                <div className="block">
                  <span className="src coach">Coach</span>
                  <p style={{ marginTop: 4 }}>
                    Hi! I explain moves using Stockfish's verified analysis and label my own advice separately. {game ? `We're looking at ${game.white} vs ${game.black}.` : 'Pick an analyzed game on the right to discuss a specific move.'}
                  </p>
                </div>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="msg user">{m.text}</div>
              ) : (
                <div key={m.id} className="msg coach">
                  {m.blocks && <CoachBlocks blocks={m.blocks} />}
                  {m.pending && <span className="spinner" />}
                </div>
              ),
            )}
          </div>
          {shownSuggestions && shownSuggestions.length > 0 && (
            <div className="chips" style={{ paddingBottom: 10 }}>
              {shownSuggestions.slice(0, 6).map((s) => (
                <button key={s} className="chip" onClick={() => void send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your coach…" aria-label="Message" />
            {busy ? (
              <button type="button" className="btn" onClick={() => abort.current?.abort()}>Stop</button>
            ) : (
              <button type="submit" className="btn primary" aria-label="Send"><IconSend /></button>
            )}
          </form>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          {panel.kind === 'quiz' && (
            <div className="card">
              <div className="card-head">
                <h2>Quiz</h2>
                <button className="btn sm ghost" onClick={() => setPanel({ kind: 'context' })}>Close</button>
              </div>
              <PuzzleTrainer
                puzzle={panel.puzzle}
                socratic
                compact
                onDone={(r) => {
                  void addMemory({ id: uid('mem'), kind: 'quiz-result', text: `${r.solved ? 'Solved' : 'Missed'} “${panel.puzzle.title}” (${panel.puzzle.themes.join(', ')}) with ${r.hintsUsed} hint${r.hintsUsed === 1 ? '' : 's'}`, at: Date.now() }).catch(() => undefined);
                  chatStore.set((m) => [...m, { id: uid(), role: 'coach', blocks: [{ kind: 'text', source: 'coach', text: r.solved ? (r.hintsUsed ? 'Solved — next time try it with one fewer hint. What was the key idea in your own words?' : 'Excellent, solved without hints! Want another?') : 'Study the solution on the board. Which forcing move did you miss? Ready for another?' }], suggestions: ['Quiz me on tactics', 'Quiz me on checkmates'] }]);
                }}
                onNext={() => runActions([{ type: 'start-quiz' }], '')}
              />
            </div>
          )}
          {lesson && (
            <div className="card">
              <LessonView lesson={lesson} onClose={() => setPanel({ kind: 'context' })} />
            </div>
          )}
          {panel.kind === 'context' && (
            <div className="card stack">
              <div className="card-head" style={{ marginBottom: 0 }}>
                <h2>Context</h2>
              </div>
              <select className="select" value={gameId} onChange={(e) => setParams(e.target.value ? { game: e.target.value, ply: '0' } : {})} aria-label="Game to discuss">
                <option value="">No game — general coaching</option>
                {analyzedGames.map((g) => (
                  <option key={g.id} value={g.id}>{g.white} vs {g.black} ({g.result})</option>
                ))}
              </select>
              {game && fen ? (
                <>
                  <div style={{ maxWidth: 380 }}>
                    <Board fen={fen} orientation={game.userColor === 'b' ? 'black' : 'white'} lastMove={ply > 0 ? [game.plies[ply - 1].uci.slice(0, 2), game.plies[ply - 1].uci.slice(2, 4)] : null} id="coach-board" />
                  </div>
                  <div className="row spread">
                    <button className="btn icon" onClick={() => setPly(ply - 1)} disabled={ply <= 0} aria-label="Previous move"><IconChevronLeft /></button>
                    <span className="small mono">
                      {ply === 0 ? 'Start position' : `${Math.ceil(ply / 2)}${game.plies[ply - 1].color === 'w' ? '.' : '...'}${game.plies[ply - 1].san}`}
                      {analysis?.moves[ply - 1] && ` · ${analysis.moves[ply - 1].classification}`}
                    </span>
                    <button className="btn icon" onClick={() => setPly(ply + 1)} disabled={ply >= game.plies.length} aria-label="Next move"><IconChevronRight /></button>
                  </div>
                  {!analysis && <p className="small muted">This game isn't analyzed yet — <Link to={`/analyze/${game.id}`}>run the review</Link> first.</p>}
                </>
              ) : (
                <p className="small muted">{analyzedGames.length ? 'Choose a game to ask about specific moves.' : 'Analyze a game first to discuss its moves here.'}</p>
              )}
            </div>
          )}
          <div className="card">
            <div className="card-head">
              <h2>Lessons</h2>
            </div>
            <div className="chips">
              {LESSONS.map((l) => (
                <button key={l.id} className="chip" onClick={() => setPanel({ kind: 'lesson', lessonId: l.id })}>{l.title}</button>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h2>What I remember</h2>
              {memory.length > 0 && (
                <button className="btn sm ghost" onClick={async () => { await clearMemory(); setMemory([]); }}>
                  <IconTrash /> Forget all
                </button>
              )}
            </div>
            {memory.length ? (
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                {memory.slice(0, 8).map((m) => (
                  <li key={m.id}>{m.text}</li>
                ))}
              </ul>
            ) : (
              <p className="small faint">Completed lessons and quiz results are remembered here, on this device only.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
