import { Chess } from 'chess.js';
import { useMemo, useState } from 'react';
import { winningChances } from '../../lib/analysis/classify';
import { formatScore } from '../../lib/engine/uci';
import { evaluatePosition } from '../../lib/engine/service';
import { BUILTIN_PUZZLES } from '../../lib/practice/puzzles';
import type { PositionEval } from '../../lib/analysis/types';
import { Board } from '../Board';
import { SourceLabel } from '../CoachBlocks';
import { IconAlert } from '../Icons';

interface Candidate {
  san: string;
  fen: string;
}

const POSITIONS = BUILTIN_PUZZLES.filter((p) => p.kind === 'tactic').map((p) => ({ id: p.id, title: p.title, fen: p.fen }));

/** List up to three candidate moves, then let the engine rank them. */
export function CandidateMoves() {
  const [idx, setIdx] = useState(0);
  const pos = POSITIONS[idx % POSITIONS.length];
  const [cands, setCands] = useState<Candidate[]>([]);
  const [results, setResults] = useState<{ cand: Candidate; eval: PositionEval }[] | null>(null);
  const [best, setBest] = useState<PositionEval | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const side = pos.fen.split(' ')[1] as 'w' | 'b';

  const reset = (next = idx) => {
    setIdx(next);
    setCands([]);
    setResults(null);
    setBest(null);
    setError(null);
  };

  const onMove = (uci: string) => {
    if (cands.length >= 3 || results) return false;
    const c = new Chess(pos.fen);
    try {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (cands.some((x) => x.san === m.san)) return false;
      setCands((l) => [...l, { san: m.san, fen: c.fen() }]);
    } catch {
      return false;
    }
    return false; // board stays on the original position
  };

  const evaluate = async () => {
    setBusy(true);
    setError(null);
    const ctx = { kind: 'training' as const, fen: pos.fen };
    try {
      const top = await evaluatePosition(pos.fen, ctx, { depth: 14 });
      const evals = [];
      for (const cand of cands) evals.push({ cand, eval: await evaluatePosition(cand.fen, ctx, { depth: 14 }) });
      const ch = (p: PositionEval) => {
        const w = p.terminal === 'checkmate' ? (p.fen.split(' ')[1] === 'w' ? -1 : 1) : p.mate !== undefined ? Math.sign(p.mate) : winningChances(p.cp ?? 0);
        return side === 'w' ? w : -w;
      };
      evals.sort((a, b) => ch(b.eval) - ch(a.eval));
      setBest(top);
      setResults(evals);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const bestSan = useMemo(() => {
    if (!best?.bestMove) return null;
    const c = new Chess(pos.fen);
    return c.move({ from: best.bestMove.slice(0, 2), to: best.bestMove.slice(2, 4), promotion: best.bestMove[4] }).san;
  }, [best, pos.fen]);

  const label = (p: PositionEval) => (p.terminal === 'checkmate' ? 'Checkmate' : p.terminal ? 'Draw' : formatScore({ cp: p.cp, mate: p.mate }));

  return (
    <div className="trainer">
      <Board fen={pos.fen} orientation={side === 'w' ? 'white' : 'black'} onMove={results ? undefined : onMove} movableColor={side} id="candidates-board" />
      <div className="stack">
        <h2>Candidate moves</h2>
        <p className="muted">
          Strong players list a few candidates before calculating. Play up to three candidate moves for {side === 'w' ? 'White' : 'Black'} on the board (the position resets after each), then compare them with the engine.
        </p>
        <div className="block">
          <span className="src coach">Coach</span>
          <p style={{ marginTop: 4 }}>Start with forcing moves — checks, captures and threats — then consider quiet improving moves.</p>
        </div>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {cands.map((c) => (
            <li key={c.san} className="mono">{c.san}</li>
          ))}
          {!cands.length && <li className="faint" style={{ listStyle: 'none', marginLeft: -20 }}>No candidates yet.</li>}
        </ol>
        {error && (
          <div className="notice error">
            <IconAlert />
            <span>{error}</span>
          </div>
        )}
        {results && best && (
          <div className="block engine">
            <SourceLabel source="engine" />
            <div style={{ marginTop: 6 }}>
              {results.map((r, i) => (
                <div key={r.cand.san} className="engine-line">
                  <span className="score">{label(r.eval)}</span>
                  <span>{i + 1}. {r.cand.san}{r.cand.san === bestSan ? ' — engine\'s top choice' : ''}</span>
                </div>
              ))}
            </div>
            <p className="small" style={{ marginTop: 6 }}>
              Engine's best move: <strong>{bestSan}</strong> ({label(best)}){cands.some((c) => c.san === bestSan) ? ' — it was on your list. Well done.' : ' — it was not on your list.'}
            </p>
          </div>
        )}
        <div className="row wrap">
          {!results ? (
            <>
              <button className="btn primary" disabled={!cands.length || busy} onClick={() => void evaluate()}>
                {busy ? 'Evaluating…' : 'Compare with engine'}
              </button>
              <button className="btn ghost" disabled={!cands.length} onClick={() => setCands([])}>Clear</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => reset(idx + 1)}>Next position</button>
          )}
        </div>
      </div>
    </div>
  );
}
