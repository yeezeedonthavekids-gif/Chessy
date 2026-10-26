import { Chess } from 'chess.js';
import { useEffect, useMemo, useState } from 'react';
import { winningChances } from '../../lib/analysis/classify';
import type { PositionEval } from '../../lib/analysis/types';
import { evaluatePosition } from '../../lib/engine/service';
import { CLASSIC_GAMES, type ClassicGame } from '../../data/classicGames';
import { Board } from '../Board';
import { SourceLabel } from '../CoachBlocks';
import { IconAlert } from '../Icons';

interface Step {
  fenBefore: string;
  san: string;
  uci: string;
  replyUci?: string;
}

function stepsFor(game: ClassicGame): Step[] {
  const c = new Chess();
  c.loadPgn(game.pgn);
  const hist = c.history({ verbose: true });
  const steps: Step[] = [];
  hist.forEach((m, i) => {
    if (m.color !== game.side) return;
    const reply = hist[i + 1];
    steps.push({ fenBefore: m.before, san: m.san, uci: m.from + m.to + (m.promotion ?? ''), replyUci: reply ? reply.from + reply.to + (reply.promotion ?? '') : undefined });
  });
  return steps;
}

const chancesFor = (p: PositionEval, side: 'w' | 'b') => {
  const white = p.terminal === 'checkmate' ? (p.fen.split(' ')[1] === 'w' ? -1 : 1) : p.mate !== undefined ? Math.sign(p.mate) : winningChances(p.cp ?? 0);
  return side === 'w' ? white : -white;
};

/** Guess the master's move; Stockfish scores guesses that differ from the game move. */
export function GuessTheMove() {
  const [gameId, setGameId] = useState(CLASSIC_GAMES[0].id);
  const game = CLASSIC_GAMES.find((g) => g.id === gameId)!;
  const steps = useMemo(() => stepsFor(game), [game]);
  const [i, setI] = useState(4); // skip the first few opening moves
  const [score, setScore] = useState(0);
  const [verdict, setVerdict] = useState<{ points: number; text: string; guessSan: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setI(Math.min(4, steps.length - 1));
    setScore(0);
    setVerdict(null);
  }, [gameId, steps.length]);

  const step = steps[i];
  const done = i >= steps.length;

  const onMove = (uci: string) => {
    if (busy || verdict || !step) return false;
    const c = new Chess(step.fenBefore);
    let guessSan: string;
    try {
      guessSan = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
    } catch {
      return false;
    }
    if (uci === step.uci) {
      setScore((s) => s + 3);
      setVerdict({ points: 3, text: `Exactly what ${game.side === 'w' ? game.white : game.black} played.`, guessSan });
      return true;
    }
    setBusy(true);
    const ctx = { kind: 'training' as const, fen: step.fenBefore };
    const played = new Chess(step.fenBefore);
    played.move(step.san);
    Promise.all([evaluatePosition(c.fen(), ctx, { depth: 14 }), evaluatePosition(played.fen(), ctx, { depth: 14 })])
      .then(([g, p]) => {
        const diff = chancesFor(p, game.side) - chancesFor(g, game.side);
        const points = diff <= 0.05 ? 2 : diff <= 0.15 ? 1 : 0;
        setScore((s) => s + points);
        setVerdict({
          points,
          guessSan,
          text:
            points === 2
              ? `The game move was ${step.san}, but the engine rates your ${guessSan} just as highly.`
              : points === 1
                ? `Close. The game move was ${step.san}; your ${guessSan} is a little weaker according to the engine.`
                : `The game continued ${step.san}. The engine rates ${guessSan} clearly worse here.`,
        });
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
    return true;
  };

  return (
    <div className="stack">
      <div className="row wrap spread">
        <select className="select" style={{ width: 'auto' }} value={gameId} onChange={(e) => setGameId(e.target.value)} aria-label="Classic game">
          {CLASSIC_GAMES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title} — {g.white} vs {g.black}, {g.year}
            </option>
          ))}
        </select>
        <span className="badge gold">Score: {score} / {Math.max(0, Math.min(i, steps.length) - Math.min(4, steps.length - 1)) * 3}</span>
      </div>
      {error && (
        <div className="notice error">
          <IconAlert />
          <span>{error}</span>
        </div>
      )}
      {done ? (
        <div className="empty">
          <h3>Game complete — {score} points</h3>
          <p>3 points for the game move, 2 if the engine rates your move equally, 1 if it is close.</p>
          <button className="btn primary" style={{ marginTop: 10 }} onClick={() => { setI(Math.min(4, steps.length - 1)); setScore(0); setVerdict(null); }}>
            Play again
          </button>
        </div>
      ) : (
        <div className="trainer">
          <Board fen={step.fenBefore} orientation={game.side === 'w' ? 'white' : 'black'} onMove={verdict ? undefined : onMove} movableColor={game.side} id="guess-board" />
          <div className="stack">
            <h2>Move {Math.ceil((i + 1))} of {steps.length} for {game.side === 'w' ? game.white : game.black}</h2>
            <p className="muted">What would you play? Make your move on the board — you commit with your first move.</p>
            {busy && <p className="small muted row"><span className="spinner" /> Comparing with the game move…</p>}
            {verdict && (
              <>
                <div className="block engine">
                  <SourceLabel source="engine" />
                  <p style={{ marginTop: 4 }}>{verdict.text}</p>
                  <p className="small faint">+{verdict.points} point{verdict.points === 1 ? '' : 's'}</p>
                </div>
                <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => { setVerdict(null); setI(i + 1); }}>
                  Next move
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
