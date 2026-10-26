import { Chess } from 'chess.js';
import { useEffect, useRef, useState } from 'react';
import { winningChances } from '../../lib/analysis/classify';
import { classifyMove, CLASS_LABEL } from '../../lib/analysis/classify';
import { isValidFen } from '../../lib/chess/pgn';
import { START_FEN } from '../../lib/chess/types';
import { AbortError } from '../../lib/engine/engine';
import { engineMove, evaluatePosition } from '../../lib/engine/service';
import type { PositionEval } from '../../lib/analysis/types';
import { settingsStore, type SkillLevel } from '../../state/settings';
import { useStore } from '../../state/store';
import { Board } from '../Board';
import { SourceLabel } from '../CoachBlocks';
import { IconAlert } from '../Icons';

const SKILL: Record<SkillLevel, number> = { beginner: 2, intermediate: 7, advanced: 13, expert: 20 };

const chances = (p: PositionEval, side: 'w' | 'b') => {
  const w = p.terminal === 'checkmate' ? (p.fen.split(' ')[1] === 'w' ? -1 : 1) : p.mate !== undefined ? Math.sign(p.mate) : winningChances(p.cp ?? 0);
  return side === 'w' ? w : -w;
};

/** Standalone training board: play any position against the coach engine. */
export function PracticeBoard() {
  const { skillLevel } = useStore(settingsStore);
  const [startFen, setStartFen] = useState(START_FEN);
  const [fenInput, setFenInput] = useState('');
  const [history, setHistory] = useState<string[]>([START_FEN]);
  const [side, setSide] = useState<'w' | 'b'>('w');
  const [level, setLevel] = useState<SkillLevel>(skillLevel);
  const [feedback, setFeedback] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const fen = history[history.length - 1];
  const chess = new Chess(fen);
  const over = chess.isGameOver();

  useEffect(() => () => abort.current?.abort(), []);

  const engineTurn = (from: string) => {
    setThinking(true);
    abort.current = new AbortController();
    engineMove(from, { skillLevel: SKILL[level], movetime: 400, signal: abort.current.signal })
      .then((uci) => {
        if (!uci) return;
        const c = new Chess(from);
        c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        setHistory((h) => [...h, c.fen()]);
      })
      .catch((e) => !(e instanceof AbortError) && setError((e as Error).message))
      .finally(() => setThinking(false));
  };

  const start = (fenToUse: string, color: 'w' | 'b') => {
    abort.current?.abort();
    setError(null);
    setNote(null);
    setStartFen(fenToUse);
    setHistory([fenToUse]);
    setSide(color);
    if (new Chess(fenToUse).turn() !== color) engineTurn(fenToUse);
  };

  const onMove = (uci: string) => {
    if (thinking || over || chess.turn() !== side) return false;
    const c = new Chess(fen);
    let san: string;
    try {
      san = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
    } catch {
      return false;
    }
    const after = c.fen();
    setHistory((h) => [...h, after]);
    setNote(null);
    if (feedback) {
      const ctx = { kind: 'training' as const, fen };
      Promise.all([evaluatePosition(fen, ctx, { depth: 12 }), evaluatePosition(after, ctx, { depth: 12 })])
        .then(([b, a]) => {
          const loss = Math.max(0, chances(b, side) - chances(a, side));
          const cls = classifyMove({ wcLoss: b.bestMove === uci ? 0 : loss, playedBest: b.bestMove === uci, legalMoveCount: new Chess(fen).moves().length });
          const bestSan = b.bestMove ? new Chess(fen).move({ from: b.bestMove.slice(0, 2), to: b.bestMove.slice(2, 4), promotion: b.bestMove[4] }).san : null;
          setNote(`${san}: ${CLASS_LABEL[cls]}${bestSan && bestSan !== san && loss >= 0.05 ? ` (engine preferred ${bestSan})` : ''}.`);
        })
        .catch(() => undefined);
    }
    if (!c.isGameOver()) engineTurn(after);
    return true;
  };

  const undo = () => {
    abort.current?.abort();
    setNote(null);
    setHistory((h) => {
      if (h.length <= 1) return h;
      // Undo back to the last position where it was the trainee's turn.
      let n = h.slice(0, -1);
      while (n.length > 1 && new Chess(n[n.length - 1]).turn() !== side) n = n.slice(0, -1);
      return n;
    });
  };

  const status = over
    ? chess.isCheckmate()
      ? chess.turn() === side
        ? 'You were checkmated.'
        : 'Checkmate — you win!'
      : 'Draw.'
    : thinking
      ? 'Coach is thinking…'
      : chess.turn() === side
        ? 'Your move.'
        : '';

  return (
    <div className="trainer">
      <Board fen={fen} orientation={side === 'w' ? 'white' : 'black'} onMove={onMove} movableColor={side} id="practice-board" />
      <div className="stack">
        <h2>Practice board</h2>
        <p className="muted small">
          A private sandbox for standalone training positions — completely separate from your online games. Positions from your ongoing Chess.com daily games are refused.
        </p>
        <div className="grid grid-2">
          <div className="field">
            <label className="label" htmlFor="pb-level">Coach strength</label>
            <select id="pb-level" className="select" value={level} onChange={(e) => setLevel(e.target.value as SkillLevel)}>
              <option value="beginner">Gentle (beginner)</option>
              <option value="intermediate">Club (intermediate)</option>
              <option value="advanced">Strong (advanced)</option>
              <option value="expert">Full strength</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="pb-side">You play</label>
            <select id="pb-side" className="select" value={side} onChange={(e) => start(startFen, e.target.value as 'w' | 'b')}>
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="pb-fen">Start from a FEN (optional)</label>
          <div className="row">
            <input id="pb-fen" className="input mono" value={fenInput} onChange={(e) => setFenInput(e.target.value)} placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" />
            <button
              className="btn"
              onClick={() => {
                const f = fenInput.trim() || START_FEN;
                if (!isValidFen(f)) {
                  setError('That FEN is not a legal position.');
                  return;
                }
                start(f, side);
              }}
            >
              Load
            </button>
          </div>
        </div>
        <label className="check small">
          <input type="checkbox" checked={feedback} onChange={(e) => setFeedback(e.target.checked)} />
          <span>Rate each of my moves after I play it</span>
        </label>
        <p className="row small">{thinking && <span className="spinner" />} {status}</p>
        {note && (
          <div className="block engine">
            <SourceLabel source="engine" />
            <p style={{ marginTop: 4 }}>{note}</p>
          </div>
        )}
        {error && (
          <div className="notice error">
            <IconAlert />
            <span>{error}</span>
          </div>
        )}
        <div className="row wrap">
          <button className="btn" onClick={undo} disabled={history.length <= 1}>Take back</button>
          <button className="btn ghost" onClick={() => start(START_FEN, side)}>New game</button>
        </div>
      </div>
    </div>
  );
}
