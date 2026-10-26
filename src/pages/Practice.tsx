import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LockedNotice } from '../components/LockedNotice';
import { PuzzleTrainer } from '../components/PuzzleTrainer';
import { useGlobalLock } from '../hooks/useGlobalLock';
import { CandidateMoves } from '../components/practice/CandidateMoves';
import { DrillTrainer } from '../components/practice/DrillTrainer';
import { GuessTheMove } from '../components/practice/GuessTheMove';
import { OpeningQuiz } from '../components/practice/OpeningQuiz';
import { PracticeBoard } from '../components/practice/PracticeBoard';
import { BUILTIN_PUZZLES, LEVEL_MAX_RATING, puzzlesFromAnalyses, type Puzzle } from '../lib/practice/puzzles';
import { listAttempts, type PuzzleAttempt } from '../lib/storage/db';
import { dataStore } from '../state/data';
import { settingsStore } from '../state/settings';
import { useStore } from '../state/store';

const TABS = [
  ['puzzles', 'Tactics & mates'],
  ['endgames', 'Endgame drills'],
  ['guess', 'Guess the move'],
  ['candidates', 'Candidate moves'],
  ['openings', 'Opening quiz'],
  ['board', 'Practice board'],
] as const;
type Tab = (typeof TABS)[number][0];

export default function Practice() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'puzzles';
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  const lock = useGlobalLock();

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>Practice</h1>
          <p>Isolated training positions — never connected to a game you are playing online.</p>
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 18 }}>
        {TABS.map(([t, label]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {!lock.allowed ? (
        <LockedNotice reason={lock.reason} />
      ) : (
      <div className="card">
        {tab === 'puzzles' && <PuzzlesTab />}
        {tab === 'endgames' && <DrillsTab />}
        {tab === 'guess' && <GuessTheMove />}
        {tab === 'candidates' && <CandidateMoves />}
        {tab === 'openings' && <OpeningQuiz />}
        {tab === 'board' && <PracticeBoard />}
      </div>
      )}
    </div>
  );
}

function PuzzlesTab() {
  const { games, analyses } = useStore(dataStore);
  const { skillLevel } = useStore(settingsStore);
  const [source, setSource] = useState<'all' | 'builtin' | 'own'>('all');
  const [theme, setTheme] = useState<'all' | 'mate' | 'tactics'>('all');
  const [difficulty, setDifficulty] = useState<keyof typeof LEVEL_MAX_RATING>(skillLevel);
  const [socratic, setSocratic] = useState(false);
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState<PuzzleAttempt[]>([]);

  useEffect(() => {
    void listAttempts().then(setAttempts).catch(() => undefined);
  }, [index]);

  const own = useMemo(() => puzzlesFromAnalyses(games, [...analyses.values()]), [games, analyses]);
  const pool = useMemo(() => {
    const builtin = BUILTIN_PUZZLES.filter((p) => p.kind === 'tactic' && (p.rating ?? 0) <= LEVEL_MAX_RATING[difficulty]);
    let list: Puzzle[] = source === 'builtin' ? builtin : source === 'own' ? own : [...own, ...builtin];
    if (theme === 'mate') list = list.filter((p) => p.themes.some((t) => t.startsWith('mate')));
    if (theme === 'tactics') list = list.filter((p) => !p.themes.some((t) => t.startsWith('mate-in')));
    // Unsolved first.
    const solved = new Set(attempts.filter((a) => a.solved).map((a) => a.puzzleId));
    return [...list.filter((p) => !solved.has(p.id)), ...list.filter((p) => solved.has(p.id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, theme, difficulty, own]);

  useEffect(() => setIndex(0), [source, theme, difficulty]);
  const puzzle = pool.length ? pool[index % pool.length] : null;
  const recent = attempts.slice(-20);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap spread">
        <div className="row wrap">
          <select className="select" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value as typeof source)} aria-label="Puzzle source">
            <option value="all">All puzzles</option>
            <option value="own">From my games ({own.length})</option>
            <option value="builtin">Built-in ({BUILTIN_PUZZLES.filter((p) => p.kind === 'tactic').length})</option>
          </select>
          <select className="select" style={{ width: 'auto' }} value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)} aria-label="Theme">
            <option value="all">All themes</option>
            <option value="mate">Checkmates</option>
            <option value="tactics">Tactics (no forced mate)</option>
          </select>
          <select className="select" style={{ width: 'auto' }} value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} aria-label="Difficulty">
            <option value="beginner">Up to ~900</option>
            <option value="intermediate">Up to ~1400</option>
            <option value="advanced">Up to ~1900</option>
            <option value="expert">All difficulties</option>
          </select>
          <label className="row small muted">
            <input type="checkbox" checked={socratic} onChange={(e) => setSocratic(e.target.checked)} /> Coach asks questions first
          </label>
        </div>
        {recent.length > 0 && (
          <span className="small muted">
            Last {recent.length}: {recent.filter((a) => a.solved && a.hintsUsed === 0).length} solved without hints or mistakes
          </span>
        )}
      </div>
      {puzzle ? (
        <PuzzleTrainer key={puzzle.id + socratic} puzzle={puzzle} socratic={socratic} onNext={() => setIndex((i) => i + 1)} />
      ) : (
        <div className="empty">
          <h3>No puzzles match</h3>
          <p>{source === 'own' ? 'Analyze games where your colour is known — your mistakes become puzzles here.' : 'Try a different filter.'}</p>
        </div>
      )}
      <p className="small faint">
        Built-in puzzles include finishes from public-domain classic games; every solution was checked with Stockfish. “From my games” puzzles come from mistakes the engine found in your own analyzed games, and only use positions with one clearly best move.
      </p>
    </div>
  );
}

function DrillsTab() {
  const drills = BUILTIN_PUZZLES.filter((p) => p.kind === 'drill');
  const [id, setId] = useState(drills[0]?.id);
  const drill = drills.find((d) => d.id === id) ?? drills[0];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="chips">
        {drills.map((d) => (
          <button key={d.id} className="chip" style={d.id === drill.id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setId(d.id)}>
            {d.title}
          </button>
        ))}
      </div>
      <DrillTrainer drill={drill} />
    </div>
  );
}
