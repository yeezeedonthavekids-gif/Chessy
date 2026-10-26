import { Chess } from 'chess.js';
import { useEffect, useState } from 'react';
import { continuations, fensForMoves, loadOpenings, type Opening } from '../../lib/openings/explorer';
import { listRepertoire, type RepertoireLine } from '../../lib/storage/db';
import { Board } from '../Board';
import { IconAlert, IconCheck } from '../Icons';

interface Question {
  title: string;
  moves: string[];
  /** Index of the move the user must find. */
  k: number;
  accepted: string[];
  side: 'w' | 'b';
  source: string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Quizzes the next move of named openings, or of the user's own repertoire. */
export function OpeningQuiz() {
  const [mode, setMode] = useState<'named' | 'repertoire'>('named');
  const [list, setList] = useState<Opening[]>([]);
  const [rep, setRep] = useState<RepertoireLine[]>([]);
  const [q, setQ] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });

  useEffect(() => {
    void loadOpenings().then((o) => setList(o.list));
    void listRepertoire().then(setRep).catch(() => setRep([]));
  }, []);

  const next = () => {
    setAnswer(null);
    if (mode === 'repertoire') {
      if (!rep.length) return setQ(null);
      const line = pick(rep);
      const own = line.moves.map((_, i) => i).filter((i) => (i % 2 === 0 ? 'w' : 'b') === line.color);
      if (!own.length) return setQ(null);
      const k = pick(own);
      setQ({ title: line.name, moves: line.moves, k, accepted: [line.moves[k]], side: line.color, source: 'Your repertoire' });
      return;
    }
    const candidates = list.filter((o) => o.moves.length >= 4 && o.moves.length <= 12);
    if (!candidates.length) return;
    const o = pick(candidates);
    const k = o.moves.length - 1;
    // Any named continuation from the same position counts as a book answer.
    const accepted = continuations(list, o.moves.slice(0, k)).map((c) => c.san);
    setQ({ title: o.name, moves: o.moves, k, accepted: accepted.length ? accepted : [o.moves[k]], side: k % 2 === 0 ? 'w' : 'b', source: `ECO ${o.eco}` });
  };

  useEffect(next, [mode, list.length, rep.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === 'repertoire' && !rep.length) {
    return (
      <div className="stack">
        <ModeSwitch mode={mode} setMode={setMode} />
        <div className="empty">
          <h3>No repertoire lines yet</h3>
          <p>Add lines in Openings → Repertoire, then come back to drill them.</p>
        </div>
      </div>
    );
  }
  if (!q) return <div className="spinner" />;
  const fen = fensForMoves(q.moves.slice(0, q.k))[q.k];

  const onMove = (uci: string) => {
    if (answer) return false;
    const c = new Chess(fen);
    let san: string;
    try {
      san = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
    } catch {
      return false;
    }
    const ok = q.accepted.includes(san);
    const main = q.moves[q.k];
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    setAnswer({
      ok,
      text: ok
        ? san === main
          ? `Correct — ${san} is the move of the ${q.title}.`
          : `${san} is also a known opening move here. The ${q.title} continues ${main}.`
        : `Not in ${mode === 'repertoire' ? 'your repertoire' : 'the opening book'}. The ${q.title} continues ${main}.`,
    });
    return ok;
  };

  return (
    <div className="stack">
      <div className="row wrap spread">
        <ModeSwitch mode={mode} setMode={setMode} />
        <span className="badge gold">{score.right} / {score.total}</span>
      </div>
      <div className="trainer">
        <Board fen={fen} orientation={q.side === 'w' ? 'white' : 'black'} onMove={onMove} movableColor={q.side} id="opening-quiz" />
        <div className="stack">
          <h2>{answer ? q.title : 'Name that move'}</h2>
          <p className="muted">
            {answer ? q.source : `${q.side === 'w' ? 'White' : 'Black'} to play. What is the main move here?`}
          </p>
          <p className="mono small faint">{q.moves.slice(0, q.k).map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ')}</p>
          {answer && (
            <div className={`notice ${answer.ok ? 'ok' : 'error'}`}>
              {answer.ok ? <IconCheck /> : <IconAlert />}
              <span>{answer.text}</span>
            </div>
          )}
          {answer && (
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={next}>
              Next question
            </button>
          )}
          <p className="small faint">Opening names: lichess-org/chess-openings (CC0).</p>
        </div>
      </div>
    </div>
  );
}

function ModeSwitch({ mode, setMode }: { mode: 'named' | 'repertoire'; setMode: (m: 'named' | 'repertoire') => void }) {
  return (
    <div className="tabs">
      <button className={`tab ${mode === 'named' ? 'active' : ''}`} onClick={() => setMode('named')}>Named openings</button>
      <button className={`tab ${mode === 'repertoire' ? 'active' : ''}`} onClick={() => setMode('repertoire')}>My repertoire</button>
    </div>
  );
}
