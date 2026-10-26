import { Chess, type Square } from 'chess.js';
import { useEffect, useMemo, useState } from 'react';
import { winningChances } from '../lib/analysis/classify';
import { formatLine, uciLineToSan } from '../lib/chess/pgn';
import { explainSolution } from '../lib/coach/explain';
import { evaluatePosition, FairPlayBlockedError } from '../lib/engine/service';
import { VERIFIED_WITH, checkPuzzleMove, puzzleHint, type Hint, type Puzzle } from '../lib/practice/puzzles';
import { addAttempt, uid } from '../lib/storage/db';
import { Board } from './Board';
import { SourceLabel } from './CoachBlocks';
import { IconBulb, IconCheck } from './Icons';

type Status = 'solving' | 'opponent' | 'solved' | 'revealed';

export interface PuzzleResult {
  solved: boolean;
  hintsUsed: number;
  mistakes: number;
}

/**
 * Interactive "find the best move" trainer. Hints get progressively more
 * specific; the answer and explanation are only shown after the user commits
 * to a move (or explicitly gives up).
 */
export function PuzzleTrainer({
  puzzle,
  socratic = false,
  compact = false,
  onDone,
  onNext,
}: {
  puzzle: Puzzle;
  socratic?: boolean;
  /** Single-column layout for narrow containers (e.g. the coach side panel). */
  compact?: boolean;
  onDone?: (r: PuzzleResult) => void;
  onNext?: () => void;
}) {
  const [fen, setFen] = useState(puzzle.fen);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status>('solving');
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [checking, setChecking] = useState(false);
  const [playedLine, setPlayedLine] = useState<string[]>([]);

  useEffect(() => {
    setFen(puzzle.fen);
    setStep(0);
    setStatus('solving');
    setHintsUsed(0);
    setMistakes(0);
    setLastMove(null);
    setPlayedLine([]);
    setFeedback(null);
    setHint(socratic ? puzzleHint(puzzle, 0, puzzle.fen, 1) : null);
  }, [puzzle, socratic]);

  const finish = (solved: boolean, finalStatus: Status) => {
    setStatus(finalStatus);
    const r = { solved, hintsUsed, mistakes };
    void addAttempt({ id: uid('att'), puzzleId: puzzle.id, source: puzzle.source, themes: puzzle.themes, solved: solved && mistakes === 0, hintsUsed, at: Date.now() }).catch(() => undefined);
    onDone?.(r);
  };

  const applyUci = (from: string, uci: string) => {
    const c = new Chess(from);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return { fen: c.fen(), san: m.san };
  };

  const onMove = (uci: string): boolean => {
    if (status !== 'solving' || checking) return false;
    const verdict = checkPuzzleMove(puzzle, step, fen, uci);
    if (verdict === 'wrong') {
      // An engine check accepts equally strong alternatives (e.g. a different winning move).
      const expected = puzzle.moves[step];
      setChecking(true);
      const afterUser = applyUci(fen, uci);
      const afterExpected = applyUci(fen, expected);
      const ctx = { kind: 'training' as const, fen };
      Promise.all([
        evaluatePosition(afterUser.fen, ctx, { depth: 14 }),
        evaluatePosition(afterExpected.fen, ctx, { depth: 14 }),
      ])
        .then(([u, e]) => {
          const pov = puzzle.solver === 'w' ? 1 : -1;
          const ch = (p: typeof u) => (p.terminal === 'checkmate' ? (p.fen.split(' ')[1] === 'w' ? -1 : 1) : p.mate !== undefined ? Math.sign(p.mate) : winningChances(p.cp ?? 0)) * pov;
          if (ch(u) >= ch(e) - 0.05 && ch(u) > 0.5) {
            setFen(afterUser.fen);
            setLastMove([uci.slice(0, 2), uci.slice(2, 4)]);
            setPlayedLine((l) => [...l, afterUser.san]);
            setFeedback({ kind: 'good', text: `${afterUser.san} also works — the engine rates it as strong as the main solution.` });
            finish(true, 'solved');
          } else {
            wrong(afterUser.san);
          }
        })
        .catch((err) => {
          if (err instanceof FairPlayBlockedError) setFeedback({ kind: 'info', text: err.message });
          else wrong(afterUser.san);
        })
        .finally(() => setChecking(false));
      return false;
    }
    const after = applyUci(fen, uci);
    setFen(after.fen);
    setLastMove([uci.slice(0, 2), uci.slice(2, 4)]);
    setPlayedLine((l) => [...l, after.san]);
    setHint(null);
    if (verdict === 'solved' || verdict === 'alternative-mate') {
      setFeedback({ kind: 'good', text: verdict === 'alternative-mate' ? `${after.san} — checkmate! A different mate from the main line, equally good.` : `${after.san}! Correct.` });
      finish(true, 'solved');
      return true;
    }
    // correct, opponent replies
    setFeedback({ kind: 'good', text: `${after.san} — good. Keep going.` });
    setStatus('opponent');
    const reply = puzzle.moves[step + 1];
    setTimeout(() => {
      const r = applyUci(after.fen, reply);
      setFen(r.fen);
      setLastMove([reply.slice(0, 2), reply.slice(2, 4)]);
      setPlayedLine((l) => [...l, r.san]);
      setStep(step + 2);
      setStatus('solving');
      if (socratic) setHint(puzzleHint(puzzle, step + 2, r.fen, 1));
    }, 550);
    return true;
  };

  const wrong = (san: string) => {
    setMistakes((m) => m + 1);
    setFeedback({
      kind: 'bad',
      text: socratic
        ? `${san} doesn't work here. ${puzzleHint(puzzle, step, fen, Math.min(3, hintsUsed + 2)).text} Try again.`
        : `${san} isn't the solution. Look again — or take a hint.`,
    });
  };

  const takeHint = () => {
    const next = Math.min(4, (hint?.level ?? 0) + 1);
    if (next === 4) {
      reveal();
      return;
    }
    setHint(puzzleHint(puzzle, step, fen, next));
    setHintsUsed((h) => h + 1);
  };

  const reveal = () => {
    setHint(puzzleHint(puzzle, step, fen, 4));
    setFeedback({ kind: 'info', text: 'Solution shown. Study the line, then try the next puzzle.' });
    finish(false, 'revealed');
  };

  const solutionSan = useMemo(() => uciLineToSan(puzzle.fen, puzzle.moves), [puzzle]);
  const narration = useMemo(() => explainSolution(puzzle.fen, solutionSan), [puzzle, solutionSan]);
  const done = status === 'solved' || status === 'revealed';
  const highlights: Record<string, string> = {};
  hint?.squares?.forEach((sq) => (highlights[sq] = 'rgba(242,193,78,0.55)'));

  return (
    <div className={compact ? 'stack' : 'trainer'}>
      <div className="stack" style={{ gap: 8, maxWidth: compact ? 420 : undefined }}>
        <Board
          fen={fen}
          orientation={puzzle.solver === 'w' ? 'white' : 'black'}
          onMove={done ? undefined : onMove}
          movableColor={puzzle.solver}
          lastMove={lastMove}
          highlights={highlights}
          arrows={status === 'revealed' && hint?.squares?.length === 2 ? [[hint.squares[0] as Square, hint.squares[1] as Square, 'rgba(111,191,115,0.85)']] : []}
          id={`puzzle-${puzzle.id}`}
        />
      </div>
      <div className="stack">
        <div>
          <div className="row spread">
            <h2>{puzzle.title}</h2>
            {puzzle.rating && <span className="badge">~{puzzle.rating}</span>}
          </div>
          <p className="muted small" style={{ marginTop: 4 }}>
            {puzzle.solver === 'w' ? 'White' : 'Black'} to move. {puzzle.themes.some((t) => t.startsWith('mate-in')) ? `Find the ${puzzle.themes.find((t) => t.startsWith('mate-in'))!.replace(/-/g, ' ')}.` : 'Find the best move.'}
          </p>
          {puzzle.origin && <p className="small faint">From {puzzle.origin.label}. You played {puzzle.origin.playedSan}.</p>}
        </div>

        {hint && !done && (
          <div className="block">
            <div className="row" style={{ marginBottom: 4 }}>
              <IconBulb width={14} height={14} style={{ color: 'var(--accent)' }} />
              <span className="src coach">{hint.level === 1 ? 'Coach asks' : `Hint ${hint.level}`}</span>
            </div>
            <p>{hint.text}</p>
          </div>
        )}

        {feedback && (
          <div className={`notice ${feedback.kind === 'good' ? 'ok' : feedback.kind === 'bad' ? 'error' : 'info'}`}>
            {feedback.kind === 'good' ? <IconCheck /> : null}
            <span>{feedback.text}</span>
          </div>
        )}
        {checking && (
          <p className="small muted row">
            <span className="spinner" /> Checking your move with the engine…
          </p>
        )}

        {!done ? (
          <div className="row wrap">
            <button className="btn" onClick={takeHint} disabled={status !== 'solving'}>
              <IconBulb /> {hint ? (hint.level >= 3 ? 'Show solution' : 'More specific hint') : 'Hint'}
            </button>
            {mistakes > 0 && (
              <button className="btn ghost" onClick={reveal}>
                Give up
              </button>
            )}
          </div>
        ) : (
          <div className="stack">
            <div className="block engine">
              <div style={{ marginBottom: 4 }}>
                <SourceLabel source="engine" />
              </div>
              <p className="small">
                Solution: <span className="mono">{formatLine(puzzle.fen, solutionSan)}</span>
              </p>
              <p className="small faint">{puzzle.source === 'builtin' ? `Verified with ${VERIFIED_WITH}.` : 'From the engine analysis of your game.'}</p>
            </div>
            {narration && (
              <div className="block">
                <div style={{ marginBottom: 4 }}>
                  <SourceLabel source="coach" />
                </div>
                <p>{narration}</p>
              </div>
            )}
            {playedLine.length > 0 && <p className="small faint">Your moves: {playedLine.join(' ')}</p>}
            {onNext && (
              <button className="btn primary" onClick={onNext} style={{ alignSelf: 'flex-start' }}>
                Next puzzle
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
