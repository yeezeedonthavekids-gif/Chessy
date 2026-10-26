import { Chess } from 'chess.js';
import { useEffect, useRef, useState } from 'react';
import { AbortError } from '../../lib/engine/engine';
import { engineMove } from '../../lib/engine/service';
import type { Puzzle } from '../../lib/practice/puzzles';
import { addAttempt, uid } from '../../lib/storage/db';
import { Board } from '../Board';
import { IconAlert, IconCheck } from '../Icons';

type Outcome = { ok: boolean; text: string } | null;

/** Play a drill position out against Stockfish at full strength. */
export function DrillTrainer({ drill }: { drill: Puzzle }) {
  const [fen, setFen] = useState(drill.fen);
  const [moves, setMoves] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const abort = useRef<AbortController | null>(null);

  const reset = () => {
    abort.current?.abort();
    setFen(drill.fen);
    setMoves(0);
    setOutcome(null);
    setError(null);
    setLastMove(null);
    setThinking(false);
  };
  useEffect(reset, [drill]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => abort.current?.abort(), []);

  const judge = (c: Chess, solverMoves: number, promoted: boolean): Outcome => {
    const solverToMove = c.turn() === drill.solver;
    if (c.isCheckmate()) return solverToMove ? { ok: false, text: 'You were checkmated.' } : { ok: true, text: `Checkmate in ${solverMoves} moves!` };
    if (drill.goal === 'promote' && promoted) return { ok: true, text: `Pawn promoted in ${solverMoves} moves — technique mastered.` };
    if (c.isStalemate()) return drill.goal === 'hold-draw' ? { ok: true, text: 'Stalemate — draw held!' } : { ok: false, text: 'Stalemate! The opponent had no legal moves. Always leave the king a square.' };
    if (c.isDraw()) return drill.goal === 'hold-draw' ? { ok: true, text: 'Draw secured.' } : { ok: false, text: 'The game ended in a draw (insufficient material or repetition).' };
    if (drill.maxMoves && solverMoves >= drill.maxMoves) {
      return drill.goal === 'hold-draw' ? { ok: true, text: `You held for ${drill.maxMoves} moves. Draw secured.` } : { ok: false, text: `Move limit (${drill.maxMoves}) reached. Try a more efficient plan.` };
    }
    if (drill.goal === 'hold-draw' && !c.board().flat().some((p) => p && p.color === drill.solver && p.type === 'r')) {
      return { ok: false, text: 'You lost your rook — the draw slipped away.' };
    }
    return null;
  };

  const record = (o: Outcome) => {
    if (o) void addAttempt({ id: uid('att'), puzzleId: drill.id, source: 'builtin', themes: drill.themes, solved: o.ok, hintsUsed: 0, at: Date.now() }).catch(() => undefined);
  };

  const onMove = (uci: string): boolean => {
    if (thinking || outcome) return false;
    const c = new Chess(fen);
    let promoted = false;
    try {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      promoted = !!m.promotion;
    } catch {
      return false;
    }
    const n = moves + 1;
    setMoves(n);
    setFen(c.fen());
    setLastMove([uci.slice(0, 2), uci.slice(2, 4)]);
    const o = judge(c, n, promoted);
    if (o) {
      setOutcome(o);
      record(o);
      return true;
    }
    setThinking(true);
    abort.current = new AbortController();
    engineMove(c.fen(), { skillLevel: 20, movetime: 350, signal: abort.current.signal })
      .then((reply) => {
        if (!reply) return;
        const m = c.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
        setFen(c.fen());
        setLastMove([m.from, m.to]);
        const o2 = judge(c, n, false);
        if (o2) {
          setOutcome(o2);
          record(o2);
        }
      })
      .catch((e) => {
        if (!(e instanceof AbortError)) setError((e as Error).message);
      })
      .finally(() => setThinking(false));
    return true;
  };

  return (
    <div className="trainer">
      <Board fen={fen} orientation={drill.solver === 'w' ? 'white' : 'black'} onMove={outcome ? undefined : onMove} movableColor={drill.solver} lastMove={lastMove} id={`drill-${drill.id}`} />
      <div className="stack">
        <div className="row spread">
          <h2>{drill.title}</h2>
          <span className="badge">~{drill.rating}</span>
        </div>
        <p className="muted">
          Goal: <strong>{drill.goal === 'checkmate' ? 'deliver checkmate' : drill.goal === 'promote' ? 'promote the pawn' : 'hold the draw'}</strong>
          {drill.maxMoves ? ` within ${drill.maxMoves} moves` : ''}. You play {drill.solver === 'w' ? 'White' : 'Black'}; Stockfish defends at full strength.
        </p>
        <div className="block">
          <span className="src coach">Coach tip</span>
          <p style={{ marginTop: 4 }}>{drill.tip}</p>
        </div>
        <div className="row small muted">
          Moves: <span className="mono">{moves}{drill.maxMoves ? ` / ${drill.maxMoves}` : ''}</span>
          {thinking && (
            <>
              <span className="spinner" /> Engine is thinking…
            </>
          )}
        </div>
        {outcome && (
          <div className={`notice ${outcome.ok ? 'ok' : 'error'}`}>
            {outcome.ok ? <IconCheck /> : <IconAlert />}
            <span>{outcome.text}</span>
          </div>
        )}
        {error && (
          <div className="notice error">
            <IconAlert />
            <span>{error}</span>
          </div>
        )}
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={reset}>
          Restart drill
        </button>
      </div>
    </div>
  );
}
