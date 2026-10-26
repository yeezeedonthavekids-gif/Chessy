import { formatLine } from '../chess/pgn';
import { CLASS_LABEL } from '../analysis/classify';
import { weeklyPlan, MIN_GAMES_FOR_REPORT } from '../stats/aggregate';
import { analyzeFeatures, describeFeatures } from './features';
import { biggestMistake, describeMoveEffect, explainMove, scoreLabel } from './explain';
import { LESSONS, findLesson } from './lessons';
import type { CoachBlock, CoachContext, CoachReply } from './types';

export type Intent =
  | 'why-mistake'
  | 'what-instead'
  | 'lost-endgame'
  | 'explain-position'
  | 'weaknesses'
  | 'training-plan'
  | 'quiz'
  | 'opponent-move'
  | 'lesson'
  | 'greeting'
  | 'help';

const PATTERNS: [Intent, RegExp][] = [
  ['quiz', /\b(quiz|test me|puzzle|drill me)\b/i],
  ['training-plan', /\b(training plan|study plan|plan for me|weekly plan|what should i (study|train|practi[cs]e))\b/i],
  ['weaknesses', /\b(weakness(es)?|weak (spots?|points?)|keep (making|doing)|recurring|patterns? in my games|what am i bad at)\b/i],
  ['lost-endgame', /\b(lose|lost|losing).*\bendgame\b|\bendgame\b.*\b(lose|lost)\b/i],
  ['opponent-move', /\b(opponent'?s? move|their move|why does (my opponent'?s?|this|their) move work|why did (my opponent|they) play)\b/i],
  ['what-instead', /\b(instead|should i have|better move|what was best|best move)\b/i],
  ['why-mistake', /\b(why|how come).*(blunder|mistake|bad|lose|lost|inaccura)|\bwhy was\b/i],
  ['explain-position', /\b(explain|describe|evaluate|assess|what'?s going on|understand) (this|the) position\b|\bexplain (it|this)\b|like i'?m a beginner/i],
  ['greeting', /^(hi|hello|hey|yo|good (morning|evening))\b/i],
];

export function detectIntent(text: string): Intent {
  for (const [intent, re] of PATTERNS) if (re.test(text)) return intent;
  if (findLesson(text)) return 'lesson';
  return 'help';
}

const DEFAULT_SUGGESTIONS = [
  'Why was this move a blunder?',
  'What should I have done instead?',
  'Explain this position like I\'m a beginner',
  'What weaknesses keep appearing in my games?',
  'Give me a training plan based on my mistakes',
  'Quiz me on tactics',
  'Teach me how to attack a castled king',
];

const locked = (ctx: CoachContext): CoachReply => ({
  blocks: [
    {
      kind: 'warning',
      text: `${ctx.lockReason ?? 'Engine analysis is paused.'} I can still teach general concepts — try “Help me understand positional chess”.`,
    },
  ],
  suggestions: ['Help me understand positional chess', 'Teach me endgame basics', 'Opening principles'],
});

const needGame = (what: string): CoachReply => ({
  blocks: [
    {
      kind: 'text',
      source: 'coach',
      text: `To ${what}, open an analyzed game first: go to Analyze, pick a game, run the review, select a move, and press “Ask the coach”. I only comment on moves that Stockfish has actually evaluated.`,
    },
  ],
  suggestions: ['Quiz me on tactics', 'Help me understand positional chess'],
});

/** The offline, rule-based coach. Never invents engine data: every move/eval it cites comes from ctx.analysis. */
export function respond(input: string, ctx: CoachContext): CoachReply {
  const intent = detectIntent(input);
  const beginner = ctx.level === 'beginner' || /beginner|simple|easy/i.test(input);
  const level = beginner ? 'beginner' : ctx.level;
  const { analysis, game } = ctx;

  switch (intent) {
    case 'greeting':
      return {
        blocks: [{ kind: 'text', source: 'coach', text: 'Hi! I\'m your Chessy coach. I can explain moves from your analyzed games, find recurring weaknesses, build a training plan, or quiz you. What would you like to work on?' }],
        suggestions: DEFAULT_SUGGESTIONS,
      };

    case 'quiz': {
      const theme = /mate|checkmate/i.test(input) ? 'mate' : /endgame/i.test(input) ? 'endgame' : /fork/i.test(input) ? 'fork' : undefined;
      return {
        blocks: [{ kind: 'text', source: 'coach', text: 'Let\'s do it. I\'ll set up a position — find the best move. I won\'t reveal the answer until you commit to a move, and you can ask for hints that get more specific each time.' }],
        actions: [{ type: 'start-quiz', theme }],
      };
    }

    case 'lesson': {
      const lesson = findLesson(input)!;
      return {
        blocks: [{ kind: 'text', source: 'coach', text: `${lesson.title}: ${lesson.summary}${beginner && lesson.beginnerNote ? `\n\n${lesson.beginnerNote}` : ''}` }],
        actions: [{ type: 'start-lesson', lessonId: lesson.id }],
      };
    }

    case 'weaknesses': {
      const s = ctx.stats;
      if (!s || s.analyzedGames < MIN_GAMES_FOR_REPORT) {
        return {
          blocks: [
            {
              kind: 'text',
              source: 'coach',
              text: `I need at least ${MIN_GAMES_FOR_REPORT} analyzed games where I know your colour before I can talk about recurring patterns — you have ${s?.analyzedGames ?? 0}. Fewer games would make any conclusion guesswork.`,
            },
          ],
          suggestions: ['Quiz me on tactics', 'Opening principles'],
        };
      }
      if (!s.weaknesses.length) {
        return { blocks: [{ kind: 'text', source: 'coach', text: `Across ${s.analyzedGames} analyzed games, no error pattern repeats often enough to call it a weakness. Keep importing games and I'll keep watching.` }] };
      }
      const blocks: CoachBlock[] = [
        { kind: 'text', source: 'coach', text: `Here is what repeats across your ${s.analyzedGames} analyzed games (pattern counts come from engine-classified mistakes):` },
      ];
      s.weaknesses.forEach((w, i) => {
        blocks.push({
          kind: 'heuristic',
          text: `${i + 1}. ${w.title} — ${w.count} times in ${w.gamesAffected} game${w.gamesAffected === 1 ? '' : 's'}. ${w.description}`,
          bullets: [...w.examples.map((e) => `Example: ${e.label}${e.bestSan ? ` (engine preferred ${e.bestSan})` : ''}`), `Exercise: ${w.exercises[0]}`],
        });
      });
      return { blocks, suggestions: ['Give me a training plan based on my mistakes', 'Quiz me on tactics'] };
    }

    case 'training-plan': {
      const s = ctx.stats;
      const plan = s ? weeklyPlan(s) : null;
      const enough = s && s.analyzedGames >= MIN_GAMES_FOR_REPORT && s.weaknesses.length;
      const intro = enough
        ? `This week focuses on your top issues: ${s!.weaknesses.map((w) => w.title.toLowerCase()).join('; ')}. About 30 minutes a day.`
        : 'I don\'t have enough analyzed games to personalise this yet, so here is a balanced fundamentals week. Import and analyze more games and I\'ll tailor it.';
      return {
        blocks: [
          { kind: 'text', source: 'coach', text: intro },
          {
            kind: 'text',
            source: 'coach',
            text: 'Weekly plan',
            bullets: (plan ?? weeklyPlan({ weaknesses: [] } as never)).map((d) => `${d.day} — ${d.focus} (${d.minutes} min): ${d.tasks.join(' ')}`),
          },
        ],
        suggestions: ['Quiz me on tactics', 'What weaknesses keep appearing in my games?'],
      };
    }

    case 'why-mistake':
    case 'what-instead': {
      if (!ctx.engineAllowed) return locked(ctx);
      if (!analysis || !game) return needGame('explain a move');
      let ply = ctx.ply && ctx.ply > 0 ? ctx.ply : 0;
      let note = '';
      const m0 = ply ? analysis.moves[ply - 1] : undefined;
      const isError = m0 && ['inaccuracy', 'mistake', 'blunder'].includes(m0.classification);
      if (!ply || (!isError && intent === 'why-mistake')) {
        const worst = biggestMistake(analysis, game.userColor);
        if (!worst) return needGame('explain a move');
        if (ply && m0) note = `The selected move (${m0.san}) is rated “${CLASS_LABEL[m0.classification]}”, so let's look at your biggest error instead. `;
        ply = worst.ply;
      }
      const m = analysis.moves[ply - 1];
      let blocks = explainMove(analysis, ply, level);
      if (game.userColor && m.color !== game.userColor) {
        note += `Note: ${Math.ceil(ply / 2)}${m.color === 'w' ? '.' : '...'}${m.san} was your opponent's move. `;
      }
      if (intent === 'what-instead' && m.bestMoveSan && m.bestMoveUci !== m.uci) {
        const effect = describeMoveEffect(analysis.positions[ply - 1].fen, m.bestMoveSan);
        // The engine block already lists the line; drop the generic coach paragraph to avoid repeating it.
        blocks = blocks.filter((b) => !(b.kind === 'text' && b.source === 'coach'));
        blocks.unshift({
          kind: 'text',
          source: 'coach',
          text: `${note}Instead of ${m.san}, the engine's choice was ${m.bestMoveSan}${effect.length ? `: ${effect.join(', ')}` : ''}. Try playing it on the board and stepping through the line.`,
        });
      } else if (note) {
        blocks.unshift({ kind: 'text', source: 'coach', text: note.trim() });
      }
      return { blocks, actions: [{ type: 'open-game', gameId: game.id, ply }], suggestions: ['What should I have done instead?', 'Why does my opponent\'s move work?', 'Explain this position like I\'m a beginner'] };
    }

    case 'opponent-move': {
      if (!ctx.engineAllowed) return locked(ctx);
      if (!analysis || !game) return needGame('explain your opponent\'s move');
      let ply = ctx.ply ?? 0;
      if (game.userColor && analysis.moves[ply - 1]?.color === game.userColor) ply -= 1;
      const m = analysis.moves[ply - 1];
      if (!m) return needGame('explain your opponent\'s move');
      const before = analysis.positions[ply - 1];
      const after = analysis.positions[ply];
      const effect = describeMoveEffect(before.fen, m.san);
      const blocks: CoachBlock[] = [
        {
          kind: 'engine',
          title: `Stockfish · depth ${after.depth || analysis.depth}`,
          lines: [
            `${m.san} is rated: ${CLASS_LABEL[m.classification]}`,
            `Evaluation after it: ${scoreLabel(after)}`,
            ...(m.replyLineSan.length ? [`Best reply: ${formatLine(after.fen, m.replyLineSan.slice(0, 6))}`] : []),
          ],
        },
        {
          kind: 'text',
          source: 'coach',
          text: effect.length
            ? `${m.san} works because ${effect.join(', ')}.${['best', 'excellent', 'only-move', 'good'].includes(m.classification) ? '' : ' Note that the engine does not rate it highly — there was a better response.'}`
            : `${m.san} is mainly a positional move. Compare the engine's best reply above to see how to meet it.`,
        },
      ];
      return { blocks, suggestions: ['What should I have done instead?', 'Explain this position like I\'m a beginner'] };
    }

    case 'lost-endgame': {
      if (!ctx.engineAllowed) return locked(ctx);
      if (!analysis || !game) return needGame('review your endgame');
      const mine = analysis.moves.filter((m) => m.color === game.userColor || !game.userColor);
      const end = mine.filter((m) => m.phase === 'endgame');
      if (!end.length) {
        return { blocks: [{ kind: 'text', source: 'coach', text: 'This game never reached an endgame by my definition (most pieces still on the board), so the result was decided earlier. Ask “Why was this move a blunder?” to find the turning point.' }] };
      }
      const errors = end.filter((m) => ['mistake', 'blunder', 'inaccuracy'].includes(m.classification)).sort((a, b) => b.wcLoss - a.wcLoss);
      const first = end[0];
      const blocks: CoachBlock[] = [
        {
          kind: 'engine',
          title: 'Stockfish',
          lines: [
            `Endgame began around move ${Math.ceil(first.ply / 2)}; your winning chances then: ${Math.round(50 + 50 * first.wcBefore)}%.`,
            `Endgame errors: ${errors.length}${errors.length ? ` — worst: ${Math.ceil(errors[0].ply / 2)}${errors[0].color === 'w' ? '.' : '...'}${errors[0].san} (${CLASS_LABEL[errors[0].classification]}, best was ${errors[0].bestMoveSan})` : ''}.`,
          ],
        },
      ];
      if (errors[0]) blocks.push(...explainMove(analysis, errors[0].ply, level).filter((b) => b.kind !== 'engine'));
      else blocks.push({ kind: 'text', source: 'coach', text: first.wcBefore < -0.3 ? 'You entered the endgame already worse and defended without serious errors — the damage was done earlier.' : 'No significant endgame errors — the result was decided by an earlier phase.' });
      blocks.push({ kind: 'text', source: 'coach', text: 'Endgame drills in Practice (queen mate, rook mate, opposition, Lucena, Philidor) build exactly the technique these positions need.' });
      return { blocks, suggestions: ['Quiz me on endgames', 'Teach me endgame basics'] };
    }

    case 'explain-position': {
      if (!ctx.engineAllowed) return locked(ctx);
      if (!ctx.fen) return needGame('explain a position');
      const f = analyzeFeatures(ctx.fen, ctx.ply ?? 30);
      const blocks: CoachBlock[] = [{ kind: 'heuristic', text: 'What I see on the board:', bullets: describeFeatures(f, level) }];
      const pe = analysis && ctx.ply !== undefined ? analysis.positions[ctx.ply] : undefined;
      if (pe && pe.fen === ctx.fen) {
        const best = analysis!.moves[ctx.ply!]?.bestLineSan ?? [];
        blocks.unshift({
          kind: 'engine',
          title: `Stockfish · depth ${pe.depth}`,
          lines: [`Evaluation: ${scoreLabel(pe)} (White's perspective)`, ...(best.length ? [`Best line: ${formatLine(pe.fen, best.slice(0, 6))}`] : [])],
        });
      } else {
        blocks.push({ kind: 'text', source: 'coach', text: 'This position has no stored engine evaluation, so the notes above are general observations, not a verdict.' });
      }
      if (beginner) blocks.push({ kind: 'text', source: 'coach', text: 'Beginner checklist for any position: 1) Is anything of mine attacked? 2) Can I capture something for free? 3) Are all my pieces developed and my king safe?' });
      return { blocks, suggestions: ['What should I have done instead?', 'Help me understand positional chess'] };
    }

    default:
      return {
        blocks: [
          {
            kind: 'text',
            source: 'coach',
            text: 'I\'m the offline coach, so I understand a set of questions about your games and chess concepts. Try one of these, or open an analyzed game and press “Ask the coach”. (For free-form chat, connect a local or cloud model in Settings.)',
          },
        ],
        suggestions: [...DEFAULT_SUGGESTIONS, ...LESSONS.slice(0, 3).map((l) => `Teach me ${l.title.toLowerCase()}`)].slice(0, 9),
      };
  }
}

export { DEFAULT_SUGGESTIONS };
