import type { StoredGame } from '../chess/types';
import type { GameAnalysis, Motif, Phase } from '../analysis/types';
import { userResult } from '../import/games';

export interface WDL {
  win: number;
  draw: number;
  loss: number;
}

export interface OpeningStat extends WDL {
  name: string;
  eco?: string;
  games: number;
  avgAccuracy?: number;
}

export interface GameTrendPoint {
  gameId: string;
  playedAt: number;
  accuracy: number;
  acpl: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
}

export interface WeaknessExample {
  gameId: string;
  ply: number;
  san: string;
  bestSan: string | null;
  label: string;
}

export interface Weakness {
  motif: Motif;
  title: string;
  description: string;
  count: number;
  gamesAffected: number;
  examples: WeaknessExample[];
  exercises: string[];
  study: string[];
}

export interface PlayerStats {
  totalGames: number;
  knownColorGames: number;
  analyzedGames: number;
  results: WDL;
  asWhite: WDL;
  asBlack: WDL;
  openings: OpeningStat[];
  accuracy?: number;
  acpl?: number;
  perGame: GameTrendPoint[];
  ratePerGame?: { blunders: number; mistakes: number; inaccuracies: number };
  phaseLoss: Partial<Record<Phase, { moves: number; avgCpLoss: number; errors: number }>>;
  time: {
    gamesWithClock: number;
    avgSecondsPerMove: number;
    errorsUnderPressure: number;
    errorsWithTime: number;
    movesUnderPressure: number;
  } | null;
  endgame: { winningReached: number; winningConverted: number; losingReached: number; losingSaved: number };
  motifCounts: Partial<Record<Motif, number>>;
  weaknesses: Weakness[];
  /** Enough analysed games to talk about recurring patterns. */
  sufficient: boolean;
}

export const MIN_GAMES_FOR_REPORT = 5;

export const WEAKNESS_INFO: Record<Motif, { title: string; description: string; exercises: string[]; study: string[] }> = {
  'hung-piece': {
    title: 'Leaving pieces unprotected',
    description: 'Moves that left a piece where it could be captured for free or for less than it is worth.',
    exercises: [
      'Before every move in your next 10 games, say out loud which of your pieces are undefended.',
      'Solve 10 "hanging piece" puzzles a day in Practice → Tactics (themes: capture, hanging-piece).',
      'Replay your own examples below and find the safe square for the piece first.',
    ],
    study: ['Blunder-check routine (Coach lesson: Candidate moves and calculation)', 'Counting attackers and defenders'],
  },
  'missed-material': {
    title: 'Missing chances to win material',
    description: 'Positions where a capture or tactic would have won material and a different move was played.',
    exercises: [
      'At the start of every move, scan all captures for both sides — even ones that look bad.',
      'Do daily capture/tactics puzzles in Practice, aiming for accuracy over speed.',
      'Re-solve the "Your games" puzzles generated from your own missed chances.',
    ],
    study: ['Tactical patterns lesson', 'Counting material in exchanges'],
  },
  'missed-mate': {
    title: 'Missing forced mates',
    description: 'A forced checkmate was available and not played.',
    exercises: [
      'Solve mate-in-1 and mate-in-2 puzzles daily until you solve 9/10 without hints.',
      'In every position where the enemy king is exposed, look at every check first.',
    ],
    study: ['Basic mating patterns: back-rank, smothered, Arabian, ladder', 'Attacking the castled king lesson'],
  },
  'allowed-mate': {
    title: 'Allowing mating attacks',
    description: 'Moves after which your opponent had a forced mate.',
    exercises: [
      'Before each move, ask: "what checks does my opponent have after this?"',
      'Practise back-rank awareness: create "luft" (a flight square) when your king is boxed in.',
    ],
    study: ['King safety', 'Back-rank mate patterns'],
  },
  'missed-fork': {
    title: 'Missing double attacks',
    description: 'A fork (one piece attacking two targets) was available.',
    exercises: ['Solve fork puzzles daily', 'Look for loose pieces and the king on squares a knight can hit together.'],
    study: ['Tactical patterns lesson: forks'],
  },
  'allowed-fork': {
    title: 'Walking into forks',
    description: 'Moves that let your opponent attack two of your pieces at once.',
    exercises: [
      'When your king and an unprotected piece are a knight\'s jump apart from one square, fix it.',
      'After choosing a move, check your opponent\'s knight jumps and queen checks.',
    ],
    study: ['Tactical patterns lesson: forks', 'Keeping pieces protected'],
  },
  'missed-win': {
    title: 'Not converting winning positions',
    description: 'You reached a winning position (engine: clearly better) and let most of the advantage slip.',
    exercises: [
      'Play winning positions out against the engine in Practice → Endgame drills.',
      'When ahead, trade pieces, keep your king safe, and avoid unnecessary complications.',
    ],
    study: ['Endgame fundamentals lesson: converting an advantage'],
  },
  'threw-advantage': {
    title: 'Losing the thread when better',
    description: 'A good position turned equal or worse after one move.',
    exercises: ['Use the candidate-move routine in calm positions, not only in sharp ones.', 'Review the turning point of each game in Analyze.'],
    study: ['Positional chess basics', 'Candidate moves and calculation'],
  },
  'opening-principle': {
    title: 'Opening principles',
    description: 'Early queen moves, king walks or slow flank pawn moves that cost time in the opening.',
    exercises: [
      'Build a small repertoire for White and Black in Openings and drill it weekly.',
      'In your next games, aim to castle by move 10 and develop all minor pieces first.',
    ],
    study: ['Opening principles lesson', 'Your repertoire lines'],
  },
  'endgame-technique': {
    title: 'Endgame technique',
    description: 'Mistakes made after most pieces were traded.',
    exercises: [
      'Practise the endgame drills (queen mate, rook mate, opposition, Lucena, Philidor) until you can do them without hints.',
      'Activate your king as soon as queens come off.',
    ],
    study: ['Endgame fundamentals lesson'],
  },
  'time-pressure': {
    title: 'Mistakes in time trouble',
    description: 'Mistakes made with less than 30 seconds (or under 10% of the starting time) on the clock.',
    exercises: [
      'Play longer time controls for a week to build calmer habits.',
      'Set a budget: keep a third of your time when you reach move 30.',
    ],
    study: ['Time management lesson'],
  },
};

const emptyWDL = (): WDL => ({ win: 0, draw: 0, loss: 0 });

export function computeStats(games: StoredGame[], analyses: GameAnalysis[]): PlayerStats {
  const analysisById = new Map(analyses.map((a) => [a.gameId, a]));
  const results = emptyWDL();
  const asWhite = emptyWDL();
  const asBlack = emptyWDL();
  const openingMap = new Map<string, OpeningStat & { accSum: number; accN: number }>();
  const perGame: GameTrendPoint[] = [];
  const phase: PlayerStats['phaseLoss'] = {};
  const phaseAcc: Record<string, { moves: number; loss: number; errors: number }> = {};
  const motifCounts: Partial<Record<Motif, number>> = {};
  const motifGames: Partial<Record<Motif, Set<string>>> = {};
  const examples: Partial<Record<Motif, WeaknessExample[]>> = {};
  const endgame = { winningReached: 0, winningConverted: 0, losingReached: 0, losingSaved: 0 };
  let clockGames = 0;
  let clockSeconds = 0;
  let clockMoves = 0;
  let errorsUnderPressure = 0;
  let errorsWithTime = 0;
  let movesUnderPressure = 0;
  let accSum = 0;
  let acplSum = 0;
  let analyzed = 0;
  let known = 0;
  let totals = { blunders: 0, mistakes: 0, inaccuracies: 0 };

  for (const g of games) {
    const r = userResult(g);
    if (!g.userColor) continue;
    known++;
    if (r) {
      results[r]++;
      (g.userColor === 'w' ? asWhite : asBlack)[r]++;
    }
    const opName = g.openingName ?? (g.eco ? `ECO ${g.eco}` : 'Unknown opening');
    const op =
      openingMap.get(opName) ?? { name: opName, eco: g.eco, games: 0, ...emptyWDL(), accSum: 0, accN: 0 };
    op.games++;
    if (r) op[r]++;

    const a = analysisById.get(g.id);
    if (a) {
      analyzed++;
      const mine = g.userColor === 'w' ? a.white : a.black;
      accSum += mine.accuracy;
      acplSum += mine.acpl;
      op.accSum += mine.accuracy;
      op.accN++;
      totals = {
        blunders: totals.blunders + mine.counts.blunder,
        mistakes: totals.mistakes + mine.counts.mistake,
        inaccuracies: totals.inaccuracies + mine.counts.inaccuracy,
      };
      perGame.push({
        gameId: g.id,
        playedAt: g.playedAt,
        accuracy: mine.accuracy,
        acpl: mine.acpl,
        blunders: mine.counts.blunder,
        mistakes: mine.counts.mistake,
        inaccuracies: mine.counts.inaccuracy,
      });

      let hasClock = false;
      let reachedWinningEndgame = false;
      let reachedLosingEndgame = false;
      const base = Number(g.timeControl?.match(/^(\d+)/)?.[1]) || undefined;
      for (const m of a.moves) {
        if (m.color !== g.userColor) continue;
        const pa = (phaseAcc[m.phase] ??= { moves: 0, loss: 0, errors: 0 });
        pa.moves++;
        pa.loss += m.cpLoss;
        const isError = m.classification === 'mistake' || m.classification === 'blunder';
        if (isError) pa.errors++;
        if (m.phase === 'endgame') {
          if (m.wcBefore >= 0.5) reachedWinningEndgame = true;
          if (m.wcBefore <= -0.5) reachedLosingEndgame = true;
        }
        if (m.clock !== undefined) {
          hasClock = true;
          if (m.timeSpent !== undefined) {
            clockSeconds += m.timeSpent;
            clockMoves++;
          }
          const pressure = m.clock < 30 || (base !== undefined && m.clock < base * 0.1);
          if (pressure) {
            movesUnderPressure++;
            if (isError) errorsUnderPressure++;
          } else if (isError) errorsWithTime++;
        }
        for (const motif of m.motifs) {
          motifCounts[motif] = (motifCounts[motif] ?? 0) + 1;
          (motifGames[motif] ??= new Set()).add(g.id);
          const list = (examples[motif] ??= []);
          if (list.length < 3) {
            const opp = g.userColor === 'w' ? g.black : g.white;
            list.push({
              gameId: g.id,
              ply: m.ply,
              san: m.san,
              bestSan: m.bestMoveSan,
              label: `vs ${opp}, move ${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'}${m.san}`,
            });
          }
        }
      }
      if (hasClock) clockGames++;
      if (reachedWinningEndgame) {
        endgame.winningReached++;
        if (r === 'win') endgame.winningConverted++;
      }
      if (reachedLosingEndgame) {
        endgame.losingReached++;
        if (r === 'win' || r === 'draw') endgame.losingSaved++;
      }
    }
    openingMap.set(opName, op);
  }

  for (const [p, v] of Object.entries(phaseAcc)) {
    phase[p as Phase] = { moves: v.moves, avgCpLoss: Math.round(v.loss / v.moves), errors: v.errors };
  }

  const weaknesses: Weakness[] = (Object.entries(motifCounts) as [Motif, number][])
    .filter(([, c]) => c >= 2)
    .sort((a, b) => (motifGames[b[0]]?.size ?? 0) - (motifGames[a[0]]?.size ?? 0) || b[1] - a[1])
    .slice(0, 3)
    .map(([motif, count]) => ({
      motif,
      count,
      gamesAffected: motifGames[motif]?.size ?? 0,
      examples: examples[motif] ?? [],
      ...WEAKNESS_INFO[motif],
    }));

  const openings = [...openingMap.values()]
    .map(({ accSum: s, accN, ...o }) => ({ ...o, avgAccuracy: accN ? Math.round((s / accN) * 10) / 10 : undefined }))
    .sort((a, b) => b.games - a.games);

  return {
    totalGames: games.length,
    knownColorGames: known,
    analyzedGames: analyzed,
    results,
    asWhite,
    asBlack,
    openings,
    accuracy: analyzed ? Math.round((accSum / analyzed) * 10) / 10 : undefined,
    acpl: analyzed ? Math.round(acplSum / analyzed) : undefined,
    perGame: perGame.sort((a, b) => a.playedAt - b.playedAt),
    ratePerGame: analyzed
      ? {
          blunders: round1(totals.blunders / analyzed),
          mistakes: round1(totals.mistakes / analyzed),
          inaccuracies: round1(totals.inaccuracies / analyzed),
        }
      : undefined,
    phaseLoss: phase,
    time: clockGames
      ? {
          gamesWithClock: clockGames,
          avgSecondsPerMove: clockMoves ? round1(clockSeconds / clockMoves) : 0,
          errorsUnderPressure,
          errorsWithTime,
          movesUnderPressure,
        }
      : null,
    endgame,
    motifCounts,
    weaknesses,
    sufficient: analyzed >= MIN_GAMES_FOR_REPORT,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function pct(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : '–';
}

export interface PlanDay {
  day: string;
  focus: string;
  tasks: string[];
  minutes: number;
}

/** A realistic weekly plan built from the top weaknesses (or general fundamentals). */
export function weeklyPlan(stats: PlayerStats, minutesPerDay = 30): PlanDay[] {
  const w = stats.weaknesses;
  const first = w[0];
  const second = w[1] ?? w[0];
  const third = w[2] ?? w[0];
  const t = (wk: Weakness | undefined, i: number, fallback: string) => wk?.exercises[i % wk.exercises.length] ?? fallback;
  const m = minutesPerDay;
  return [
    { day: 'Monday', focus: first?.title ?? 'Tactics', tasks: [t(first, 0, 'Solve 10 tactics puzzles with no hints.'), 'Review one of your recent losses in Analyze.'], minutes: m },
    { day: 'Tuesday', focus: 'Tactics', tasks: ['Solve puzzles in Practice, starting with "Your games".', t(second, 0, 'Do a set of mate-in-2 puzzles.')], minutes: m },
    { day: 'Wednesday', focus: second?.title ?? 'Openings', tasks: [t(second, 1, 'Drill your repertoire in Openings → Practice.'), 'Read one Coach lesson that matches this weakness.'], minutes: m },
    { day: 'Thursday', focus: 'Endgames', tasks: ['Complete one endgame drill without hints.', t(third, 0, 'Practise king activity in endgames.')], minutes: m },
    { day: 'Friday', focus: third?.title ?? 'Calculation', tasks: [t(third, 1, 'Candidate-move exercises: list 3 moves before choosing.'), 'Play one longer game (15+10 or slower).'], minutes: m },
    { day: 'Saturday', focus: 'Play', tasks: ['Play 2–3 games at a time control you can think in.', 'No analysis during games — import them afterwards.'], minutes: m * 2 },
    { day: 'Sunday', focus: 'Review', tasks: ['Import and analyse the week\'s games.', 'Ask the Coach: "What weaknesses keep appearing in my games?"'], minutes: m },
  ];
}
