import Anthropic from '@anthropic-ai/sdk';
import { formatLine } from '../chess/pgn';
import { CLASS_LABEL } from '../analysis/classify';
import type { Settings } from '../../state/settings';
import { analyzeFeatures, describeFeatures } from './features';
import { scoreLabel } from './explain';
import type { CoachContext } from './types';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

export const SYSTEM_PROMPT = `You are Chessy, a patient chess coach inside a training app. You help players improve by reviewing COMPLETED games and standalone training positions.

Rules you must follow:
- Fair play: never help with a game that is still being played. If the user says or implies a game is in progress, refuse to discuss that position and suggest they come back after the game.
- Never invent moves, variations or evaluations. Only cite concrete moves and numbers that appear in the ENGINE FACTS section, which comes from Stockfish running locally. If no engine facts are given, speak in general strategic terms and say that you have no engine verification.
- Clearly separate "the engine shows…" (verified) from your own strategic explanation.
- Adapt your language to the player's level. Be concise and concrete; prefer short paragraphs. Ask a follow-up question when practising.`;

/** Builds the factual context block sent alongside the user's message. */
export function buildContext(ctx: CoachContext): string {
  const parts: string[] = [`PLAYER LEVEL: ${ctx.level}`];
  if (!ctx.engineAllowed) {
    parts.push('ENGINE FACTS: unavailable — analysis is paused by the fair-play gate. Do not discuss specific moves for any current position.');
    return parts.join('\n');
  }
  const { game, analysis } = ctx;
  if (game) {
    parts.push(`GAME: ${game.white} vs ${game.black}, result ${game.result}${game.openingName ? `, opening ${game.openingName}` : ''}. The user played ${game.userColor === 'w' ? 'White' : game.userColor === 'b' ? 'Black' : 'an unknown side'}. This game is finished.`);
  }
  if (analysis && ctx.ply) {
    const m = analysis.moves[ctx.ply - 1];
    const before = analysis.positions[ctx.ply - 1];
    const after = analysis.positions[ctx.ply];
    if (m) {
      parts.push(
        [
          `ENGINE FACTS (Stockfish, depth ${analysis.depth}):`,
          `- Selected move: ${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'}${m.san} — classified ${CLASS_LABEL[m.classification]}`,
          `- Position before (FEN): ${before.fen}`,
          `- Evaluation before: ${scoreLabel(before)}; after: ${scoreLabel(after)} (White's perspective)`,
          m.bestMoveSan ? `- Engine best move: ${m.bestMoveSan}; best line: ${formatLine(before.fen, m.bestLineSan.slice(0, 8))}` : '',
          m.replyLineSan.length ? `- Engine's expected reply after ${m.san}: ${formatLine(after.fen, m.replyLineSan.slice(0, 6))}` : '',
          m.motifs.length ? `- Detected patterns (heuristic): ${m.motifs.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  }
  if (ctx.fen) {
    const f = analyzeFeatures(ctx.fen, ctx.ply ?? 30);
    parts.push(`BOARD OBSERVATIONS (rule-based):\n- ${describeFeatures(f, ctx.level).join('\n- ')}`);
  }
  if (ctx.stats && ctx.stats.analyzedGames) {
    const s = ctx.stats;
    parts.push(
      `PLAYER STATS (${s.analyzedGames} analyzed games): accuracy ${s.accuracy ?? '–'}%, blunders/game ${s.ratePerGame?.blunders ?? '–'}. Top recurring issues: ${s.weaknesses.map((w) => `${w.title} (${w.count}x)`).join('; ') || 'none yet'}.`,
    );
  }
  return parts.join('\n\n');
}

/** Engine SAN moves present in the context, used to verify the model's output. */
export function engineSansInContext(ctx: CoachContext): string[] {
  const m = ctx.analysis && ctx.ply ? ctx.analysis.moves[ctx.ply - 1] : undefined;
  return m ? [m.san, ...m.bestLineSan, ...m.replyLineSan] : [];
}

export async function streamCoachReply(
  settings: Settings,
  apiKey: string,
  history: ChatTurn[],
  ctx: CoachContext,
  onText: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const context = buildContext(ctx);
  const last = history[history.length - 1];
  const turns: ChatTurn[] = [...history.slice(0, -1), { role: 'user', content: `${context}\n\nQUESTION: ${last.content}` }];

  if (settings.aiProvider === 'anthropic') {
    if (!apiKey) throw new LlmError('Add your Anthropic API key in Settings, or switch to the free offline coach.');
    // The key belongs to the user and is sent straight from their browser to Anthropic.
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    // Server-side fallback re-runs a declined request on a suitable model instead of returning a refusal.
    const stream = client.beta.messages.stream(
      {
        model: settings.anthropicModel || 'claude-opus-5-5',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: turns,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming,
      { signal },
    );
    stream.on('text', (t) => onText(t));
    try {
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') throw new LlmError('The model declined to answer this request.');
      return final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new LlmError('Anthropic rejected the API key. Check it in Settings.');
      if (e instanceof Anthropic.RateLimitError) throw new LlmError('Rate limited by Anthropic. Wait a moment and try again.');
      if (e instanceof Anthropic.APIConnectionError) throw new LlmError('Could not reach Anthropic. Check your connection — the offline coach still works.');
      if (e instanceof Anthropic.APIError) throw new LlmError(`Anthropic error: ${e.message}`);
      throw e;
    }
  }

  // OpenAI-compatible chat completions (Ollama, LM Studio, llama.cpp server…).
  const base = settings.openaiBaseUrl.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({
        model: settings.openaiModel,
        stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...turns],
      }),
    });
  } catch {
    throw new LlmError(`Could not reach ${base}. Is your local model server running (and does it allow requests from this origin)?`);
  }
  if (!res.ok || !res.body) throw new LlmError(`Model server error (${res.status}).`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          onText(delta);
        }
      } catch {
        /* ignore keep-alives */
      }
    }
  }
  return full;
}
