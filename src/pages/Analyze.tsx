import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Board, type Arrow } from '../components/Board';
import { CoachBlocks } from '../components/CoachBlocks';
import { EvalBar } from '../components/EvalBar';
import { EvalGraph } from '../components/EvalGraph';
import { GameList } from '../components/GameList';
import { IconAlert, IconChevronLeft, IconChevronRight, IconCoach, IconFirst, IconFlip, IconLast, IconLock } from '../components/Icons';
import { ImportPanel } from '../components/ImportPanel';
import { MoveList } from '../components/MoveList';
import { useEngineLines } from '../hooks/useEngineLines';
import { useGameAnalysis } from '../hooks/useGameAnalysis';
import { formatLine, uciLineToSan } from '../lib/chess/pgn';
import { explainMove } from '../lib/coach/explain';
import { formatScore, toWhitePov } from '../lib/engine/uci';
import { checkAnalysis } from '../lib/fairplay/gate';
import { formatDate, timeControlLabel } from '../lib/format';
import { identifyOpening, loadOpenings, type Opening } from '../lib/openings/explorer';
import { dataStore } from '../state/data';
import { liveStatusStore } from '../state/liveStatus';
import { settingsStore } from '../state/settings';
import { useStore } from '../state/store';

const DEPTHS = [
  { d: 10, label: 'Fast (depth 10)' },
  { d: 14, label: 'Balanced (depth 14)' },
  { d: 18, label: 'Deep (depth 18)' },
  { d: 22, label: 'Very deep (depth 22)' },
];

export default function Analyze() {
  const { gameId } = useParams();
  return gameId ? <GameReview gameId={gameId} /> : <AnalyzeHome />;
}

function AnalyzeHome() {
  const navigate = useNavigate();
  const { games, analyses } = useStore(dataStore);
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>Analyze a game</h1>
          <p>Import a completed game to review it move by move with Stockfish running locally in your browser.</p>
        </div>
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <h2>Import a completed game</h2>
          </div>
          <ImportPanel onImported={(g) => g[0] && navigate(`/analyze/${g[0].id}`)} />
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Or pick a recent game</h2>
            <Link to="/games" className="small">
              All games
            </Link>
          </div>
          {games.length ? (
            <GameList games={games.slice(0, 8)} analyses={analyses} compact />
          ) : (
            <div className="empty">
              <h3>No games yet</h3>
              <p>Imported games will be listed here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface VariationMove {
  san: string;
  uci: string;
  fen: string;
}

function GameReview({ gameId }: { gameId: string }) {
  const { games, analyses, loaded } = useStore(dataStore);
  const settings = useStore(settingsStore);
  const live = useStore(liveStatusStore);
  const game = games.find((g) => g.id === gameId);
  const analysis = analyses.get(gameId);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [variation, setVariation] = useState<{ from: number; moves: VariationMove[] } | null>(null);
  const [depth, setDepth] = useState(settings.analysisDepth);
  const [showLines, setShowLines] = useState(true);
  const [opening, setOpening] = useState<Opening | null>(null);
  const { state, run, cancel } = useGameAnalysis(game);
  const [search] = useSearchParams();

  useEffect(() => {
    if (game) {
      setOrientation(game.userColor === 'b' ? 'black' : 'white');
      setPly(Math.max(0, Math.min(game.plies.length, Number(search.get('ply')) || 0)));
      setVariation(null);
    }
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!game) return;
    void loadOpenings().then(({ byEpd }) => setOpening(identifyOpening(byEpd, [game.startFen, ...game.plies.slice(0, 30).map((p) => p.fenAfter)])));
  }, [game]);

  const total = game?.plies.length ?? 0;
  const go = useCallback(
    (p: number) => {
      setVariation(null);
      setPly(Math.max(0, Math.min(total, p)));
    },
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        if (variation) setVariation((v) => (v && v.moves.length > 1 ? { ...v, moves: v.moves.slice(0, -1) } : null));
        else go(ply - 1);
      } else if (e.key === 'ArrowRight' && !variation) go(ply + 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(total);
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, ply, total, variation]);

  const ctx = useMemo(() => (game ? { kind: 'completed-game' as const, finished: game.finished, result: game.result } : null), [game]);
  const gate = ctx ? checkAnalysis(ctx, live) : null;
  const allowed = !!gate?.allowed;

  const baseFen = game ? (ply === 0 ? game.startFen : game.plies[ply - 1].fenAfter) : '';
  const fen = variation ? variation.moves[variation.moves.length - 1]?.fen ?? baseFen : baseFen;
  const running = state.status === 'running';

  const lines = useEngineLines(fen || null, ctx, { depth: 18, multiPv: 3, enabled: showLines && !running && allowed });

  if (!loaded) return <div className="page"><div className="spinner" /></div>;
  if (!game)
    return (
      <div className="page">
        <div className="empty">
          <h3>Game not found</h3>
          <p>
            It may have been deleted. <Link to="/analyze">Import another game</Link>.
          </p>
        </div>
      </div>
    );

  const onBoardMove = (uci: string) => {
    if (!variation && ply < total && game.plies[ply].uci === uci) {
      go(ply + 1);
      return true;
    }
    const c = new Chess(fen);
    try {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      const vm = { san: m.san, uci, fen: c.fen() };
      setVariation((v) => (v ? { ...v, moves: [...v.moves, vm] } : { from: ply, moves: [vm] }));
      return true;
    } catch {
      return false;
    }
  };

  const posEval = !variation && analysis && allowed ? analysis.positions[ply] : null;
  const shown = lines.result ?? posEval;
  const stm = fen.split(' ')[1] as 'w' | 'b';

  const arrows: Arrow[] = [];
  if (allowed && shown?.bestMove) arrows.push([shown.bestMove.slice(0, 2) as Square, shown.bestMove.slice(2, 4) as Square, 'rgba(111,191,115,0.85)']);
  const lastMove: [string, string] | null = variation
    ? [variation.moves.at(-1)!.uci.slice(0, 2), variation.moves.at(-1)!.uci.slice(2, 4)]
    : ply > 0
      ? [game.plies[ply - 1].uci.slice(0, 2), game.plies[ply - 1].uci.slice(2, 4)]
      : null;

  const top = orientation === 'white' ? 'b' : 'w';
  const strip = (c: 'w' | 'b') => (
    <div className="player-strip">
      <span>
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c === 'w' ? '#eee' : '#222', border: '1px solid var(--border-strong)', marginRight: 8 }} />
        <span className="name">{c === 'w' ? game.white : game.black}</span>
        {(c === 'w' ? game.whiteElo : game.blackElo) && <span className="faint"> ({c === 'w' ? game.whiteElo : game.blackElo})</span>}
        {game.userColor === c && <span className="badge gold" style={{ marginLeft: 8 }}>You</span>}
      </span>
      {analysis && allowed && <span className="mono small muted">{(c === 'w' ? analysis.white : analysis.black).accuracy.toFixed(1)}% accuracy</span>}
    </div>
  );

  const explanation = analysis && !variation && ply > 0 && allowed ? explainMove(analysis, ply, settings.skillLevel) : null;

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>
            {game.white} <span className="faint">vs</span> {game.black} <span className="mono muted">{game.result}</span>
          </h1>
          <p>
            {[opening ? `${opening.eco} · ${opening.name}` : game.openingName, timeControlLabel(game.timeControl), formatDate(game.playedAt, game.date)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="row">
          <Link className="btn" to={`/coach?game=${game.id}&ply=${ply}`}>
            <IconCoach /> Ask the coach
          </Link>
        </div>
      </div>

      <div className="analysis">
        <div className="stack analysis-board" style={{ gap: 8 }}>
          {strip(top)}
          <div className="board-shell">
            <EvalBar cp={shown?.cp} mate={shown?.mate} terminal={shown?.terminal} sideToMove={stm} orientation={orientation} locked={!allowed} />
            <Board fen={fen} orientation={orientation} onMove={onBoardMove} arrows={arrows} lastMove={lastMove} id="analysis-board" />
          </div>
          {strip(top === 'w' ? 'b' : 'w')}
          <div className="nav-controls">
            <button className="btn icon" onClick={() => go(0)} aria-label="First move"><IconFirst /></button>
            <button className="btn icon" onClick={() => (variation ? setVariation(null) : go(ply - 1))} aria-label="Previous move"><IconChevronLeft /></button>
            <button className="btn icon" onClick={() => go(ply + 1)} disabled={!!variation} aria-label="Next move"><IconChevronRight /></button>
            <button className="btn icon" onClick={() => go(total)} aria-label="Last move"><IconLast /></button>
            <button className="btn icon" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Flip board"><IconFlip /></button>
          </div>
          <p className="small faint kbd-hint" style={{ textAlign: 'center' }}>
            <span className="kbd">←</span> <span className="kbd">→</span> to step · <span className="kbd">F</span> to flip · drag pieces to explore variations
          </p>
        </div>

        <div className="analysis-side">
          {!game.finished && (
            <div className="notice warn">
              <IconLock />
              <span>{gate && !gate.allowed ? gate.reason : 'This game has no final result.'} You can still step through the moves.</span>
            </div>
          )}
          {game.finished && gate && !gate.allowed && (
            <div className="notice warn">
              <IconLock />
              <span>{gate.reason}</span>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Game review</h2>
              {analysis && allowed && <span className="small faint">{analysis.engine} · depth {analysis.depth}</span>}
            </div>
            {state.status === 'running' ? (
              <div className="stack">
                <div className="row spread small">
                  <span className="row"><span className="spinner" /> Analyzing position {state.done} of {state.total}…</span>
                  <button className="btn sm" onClick={cancel}>Cancel</button>
                </div>
                <div className="progress"><div style={{ width: `${(state.done / state.total) * 100}%` }} /></div>
                <p className="small faint">Running locally — your games never leave this device.</p>
              </div>
            ) : (
              <div className="stack">
                {analysis && allowed ? <AnalysisSummary analysis={analysis} userColor={game.userColor} /> : analysis ? <p className="muted small">Stored analysis is hidden while engine features are paused.</p> : <p className="muted small">Run Stockfish over every position to classify moves and find the turning points.</p>}
                {state.status === 'error' && (
                  <div className={`notice ${state.blocked ? 'warn' : 'error'}`}>
                    <IconAlert />
                    <span>{state.message}</span>
                  </div>
                )}
                <div className="row wrap">
                  <select className="select" style={{ width: 'auto' }} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Analysis depth">
                    {DEPTHS.map((d) => (
                      <option key={d.d} value={d.d}>{d.label}</option>
                    ))}
                  </select>
                  <button className="btn primary" disabled={!allowed} onClick={() => void run(depth)}>
                    {analysis ? 'Re-analyze' : 'Analyze game'}
                  </button>
                </div>
              </div>
            )}
            {analysis && allowed && (
              <div style={{ marginTop: 14 }}>
                <EvalGraph analysis={analysis} ply={ply} onSelect={go} />
              </div>
            )}
          </div>

          {variation && (
            <div className="notice info">
              <span style={{ flex: 1 }}>
                <strong>Exploring a variation</strong> from move {Math.ceil((variation.from + 1) / 2)}:{' '}
                <span className="mono">{formatLine(variation.from === 0 ? game.startFen : game.plies[variation.from - 1].fenAfter, variation.moves.map((m) => m.san))}</span>
              </span>
              <button className="btn sm" onClick={() => setVariation(null)}>Back to game</button>
            </div>
          )}

          {explanation && (
            <div className="card stack" style={{ gap: 8 }}>
              <div className="card-head" style={{ marginBottom: 0 }}>
                <h2>Move {Math.ceil(ply / 2)}{game.plies[ply - 1].color === 'w' ? '.' : '...'}{game.plies[ply - 1].san}</h2>
              </div>
              <CoachBlocks blocks={explanation} />
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Engine lines</h2>
              <label className="row small muted">
                <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} disabled={!allowed} /> Show
              </label>
            </div>
            {!allowed ? (
              <p className="small muted row"><IconLock width={14} height={14} /> Engine output is disabled for this game.</p>
            ) : running ? (
              <p className="small muted">Paused while the full-game analysis runs.</p>
            ) : !showLines ? (
              <p className="small muted">Hidden. Try to find the best move yourself first.</p>
            ) : lines.error ? (
              <div className="notice error"><IconAlert /><span>{lines.error}</span></div>
            ) : shown?.terminal ? (
              <p className="small muted">{shown.terminal === 'checkmate' ? 'Checkmate.' : 'Drawn position.'}</p>
            ) : shown && shown.lines.length ? (
              <div>
                {shown.lines.map((l) => {
                  const w = toWhitePov({ cp: l.cp, mate: l.mate }, stm);
                  return (
                    <div className="engine-line" key={l.multipv}>
                      <span className="score">{formatScore(w)}</span>
                      <span className="pv">{formatLine(fen, uciLineToSan(fen, l.pv.slice(0, 10)))}</span>
                    </div>
                  );
                })}
                <p className="small faint" style={{ marginTop: 6 }}>
                  Stockfish · depth {shown.depth}
                  {lines.searching ? ' · searching…' : ''}
                </p>
              </div>
            ) : (
              <p className="small muted row"><span className="spinner" /> Starting engine…</p>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Moves</h2>
            </div>
            <MoveList plies={game.plies} analysis={allowed ? analysis?.moves : undefined} current={variation ? -1 : ply} onSelect={go} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisSummary({ analysis, userColor }: { analysis: import('../lib/analysis/types').GameAnalysis; userColor: 'w' | 'b' | null }) {
  const rows = [
    ['blunder', 'Blunders', 'var(--red)'],
    ['mistake', 'Mistakes', 'var(--orange)'],
    ['inaccuracy', 'Inaccuracies', 'var(--yellow)'],
    ['best', 'Best moves', 'var(--green)'],
  ] as const;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>White{userColor === 'w' ? ' (you)' : ''}</th>
            <th>Black{userColor === 'b' ? ' (you)' : ''}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="muted">Accuracy</td>
            <td className="mono">{analysis.white.accuracy.toFixed(1)}%</td>
            <td className="mono">{analysis.black.accuracy.toFixed(1)}%</td>
          </tr>
          <tr>
            <td className="muted">Avg. centipawn loss</td>
            <td className="mono">{analysis.white.acpl}</td>
            <td className="mono">{analysis.black.acpl}</td>
          </tr>
          {rows.map(([k, label, color]) => (
            <tr key={k}>
              <td><span style={{ color }}>●</span> <span className="muted">{label}</span></td>
              <td className="mono">{analysis.white.counts[k] + (k === 'best' ? analysis.white.counts['only-move'] : 0)}</td>
              <td className="mono">{analysis.black.counts[k] + (k === 'best' ? analysis.black.counts['only-move'] : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
