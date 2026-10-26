import { useEffect, useMemo, useRef, useState } from 'react';
import { GameList } from '../components/GameList';
import { ImportPanel } from '../components/ImportPanel';
import { userResult } from '../lib/import/games';
import { deleteGame } from '../lib/storage/db';
import { runGameAnalysis } from '../lib/analysis/runner';
import { getEngine } from '../lib/engine/service';
import { settingsStore } from '../state/settings';
import { dataStore, reloadData } from '../state/data';
import { useStore } from '../state/store';

type ResultFilter = 'all' | 'win' | 'draw' | 'loss';

export default function Games() {
  const { games, analyses, loaded } = useStore(dataStore);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ResultFilter>('all');
  const [source, setSource] = useState<'all' | 'pgn' | 'chesscom' | 'lichess'>('all');
  const [onlyUnanalyzed, setOnlyUnanalyzed] = useState(false);
  const [batch, setBatch] = useState<{ index: number; total: number; done: number; of: number } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchAbort = useRef<AbortController | null>(null);
  const { analysisDepth } = useStore(settingsStore);
  useEffect(() => () => batchAbort.current?.abort(), []);

  const pending = games.filter((g) => g.finished && !analyses.has(g.id));
  const analyzeAll = async () => {
    const ac = new AbortController();
    batchAbort.current = ac;
    setBatchError(null);
    const queue = [...pending];
    try {
      for (let i = 0; i < queue.length; i++) {
        if (ac.signal.aborted) break;
        setBatch({ index: i + 1, total: queue.length, done: 0, of: queue[i].plies.length + 1 });
        await runGameAnalysis(queue[i], analysisDepth, ac.signal, (done, of) => setBatch({ index: i + 1, total: queue.length, done, of }));
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setBatchError((e as Error).message);
    } finally {
      getEngine().clearQueue();
      setBatch(null);
      batchAbort.current = null;
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games.filter((g) => {
      if (source !== 'all' && g.source !== source) return false;
      if (result !== 'all' && userResult(g) !== result) return false;
      if (onlyUnanalyzed && analyses.has(g.id)) return false;
      if (!q) return true;
      return [g.white, g.black, g.openingName, g.eco, g.headers.Event].some((v) => v?.toLowerCase().includes(q));
    });
  }, [games, analyses, query, result, source, onlyUnanalyzed]);

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>My games</h1>
          <p>{games.length} completed game{games.length === 1 ? '' : 's'} stored on this device.</p>
        </div>
        {batch ? (
          <div className="row">
            <span className="small muted row">
              <span className="spinner" /> Game {batch.index}/{batch.total} · position {batch.done}/{batch.of}
            </span>
            <button className="btn sm" onClick={() => batchAbort.current?.abort()}>Cancel</button>
          </div>
        ) : (
          pending.length > 0 && (
            <button className="btn primary" onClick={() => void analyzeAll()}>
              Analyze {pending.length} game{pending.length === 1 ? '' : 's'} (depth {analysisDepth})
            </button>
          )
        )}
      </div>
      {batchError && <div className="notice error" style={{ marginBottom: 12 }}><span>{batchError}</span></div>}
      <div className="split-side">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ marginBottom: 14 }}>
            <input className="input" style={{ maxWidth: 260 }} placeholder="Search players, openings…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search games" />
            <select className="select" style={{ width: 'auto' }} value={result} onChange={(e) => setResult(e.target.value as ResultFilter)} aria-label="Filter by result">
              <option value="all">All results</option>
              <option value="win">Wins</option>
              <option value="draw">Draws</option>
              <option value="loss">Losses</option>
            </select>
            <select className="select" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value as typeof source)} aria-label="Filter by source">
              <option value="all">All sources</option>
              <option value="chesscom">Chess.com</option>
              <option value="lichess">Lichess</option>
              <option value="pgn">PGN</option>
            </select>
            <label className="row small muted">
              <input type="checkbox" checked={onlyUnanalyzed} onChange={(e) => setOnlyUnanalyzed(e.target.checked)} /> Not analyzed
            </label>
          </div>
          {!loaded ? (
            <div className="spinner" />
          ) : filtered.length ? (
            <GameList
              games={filtered}
              analyses={analyses}
              onDelete={async (g) => {
                if (!confirm(`Delete ${g.white} vs ${g.black} and its analysis?`)) return;
                await deleteGame(g.id);
                await reloadData();
              }}
            />
          ) : (
            <div className="empty">
              <h3>{games.length ? 'No games match these filters' : 'No games yet'}</h3>
              <p>{games.length ? 'Try clearing the search.' : 'Import completed games with the panel on the right.'}</p>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Import games</h2>
          </div>
          <ImportPanel />
        </div>
      </div>
    </div>
  );
}
