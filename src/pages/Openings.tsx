import { Chess } from 'chess.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Board } from '../components/Board';
import { IconAlert, IconChevronLeft, IconChevronRight, IconFirst, IconTrash } from '../components/Icons';
import { OPENING_PRINCIPLES, TRAPS } from '../data/traps';
import { checkAnalysis } from '../lib/fairplay/gate';
import { OPENINGS_SOURCE, continuations, fensForMoves, fetchLichessExplorer, identifyOpening, loadOpenings, type ExplorerStats, type Opening } from '../lib/openings/explorer';
import { parseRepertoire, repertoireToPgn } from '../lib/openings/repertoire';
import { deleteRepertoireLine, listRepertoire, putRepertoireLine, uid, type RepertoireLine } from '../lib/storage/db';
import { liveStatusStore } from '../state/liveStatus';
import { useStore } from '../state/store';

type Tab = 'explorer' | 'repertoire' | 'traps' | 'principles';

export default function Openings() {
  const [tab, setTab] = useState<Tab>('explorer');
  const [moves, setMoves] = useState<string[]>([]);
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>Openings</h1>
          <p>Explore named openings, build your repertoire, and learn the traps to avoid.</p>
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 18 }}>
        {(
          [
            ['explorer', 'Explorer'],
            ['repertoire', 'My repertoire'],
            ['traps', 'Common traps'],
            ['principles', 'Principles'],
          ] as const
        ).map(([t, label]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'explorer' && <Explorer moves={moves} setMoves={setMoves} />}
      {tab === 'repertoire' && <Repertoire openInExplorer={(m) => { setMoves(m); setTab('explorer'); }} />}
      {tab === 'traps' && <Traps />}
      {tab === 'principles' && (
        <div className="grid grid-3">
          {OPENING_PRINCIPLES.map((p) => (
            <div key={p.title} className="card">
              <h3 style={{ marginBottom: 6 }}>{p.title}</h3>
              <p className="muted">{p.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Explorer({ moves, setMoves }: { moves: string[]; setMoves: (m: string[]) => void }) {
  const [data, setData] = useState<{ list: Opening[]; byEpd: Map<string, Opening[]> } | null>(null);
  const [stats, setStats] = useState<ExplorerStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<'w' | 'b'>('w');
  const [saved, setSaved] = useState(false);
  const live = useStore(liveStatusStore);

  useEffect(() => {
    void loadOpenings().then(setData);
  }, []);
  useEffect(() => {
    setStats(null);
    setStatsError(null);
    setSaved(false);
  }, [moves]);

  const fens = useMemo(() => fensForMoves(moves), [moves]);
  const fen = fens[fens.length - 1];
  const opening = data ? identifyOpening(data.byEpd, fens) : null;
  const exact = data?.byEpd.get(fen.split(' ').slice(0, 4).join(' '));
  const next = useMemo(() => (data ? continuations(data.list, moves).slice(0, 14) : []), [data, moves]);
  useEffect(() => setName(opening?.name ?? ''), [opening?.name]);

  const onMove = (uci: string) => {
    const c = new Chess(fen);
    try {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      setMoves([...moves, m.san]);
      return true;
    } catch {
      return false;
    }
  };

  const gate = checkAnalysis({ kind: 'training', fen }, live);

  return (
    <div className="analysis">
      <div className="stack" style={{ gap: 8 }}>
        <Board fen={fen} onMove={onMove} orientation={color === 'b' ? 'black' : 'white'} id="explorer-board" lastMove={null} />
        <div className="nav-controls">
          <button className="btn icon" onClick={() => setMoves([])} aria-label="Start position"><IconFirst /></button>
          <button className="btn icon" onClick={() => setMoves(moves.slice(0, -1))} disabled={!moves.length} aria-label="Take back"><IconChevronLeft /></button>
        </div>
      </div>
      <div className="analysis-side">
        <div className="card">
          <div className="card-head">
            <h2>{opening ? opening.name : moves.length ? 'Unnamed position' : 'Starting position'}</h2>
            {opening && <span className="badge gold mono">{opening.eco}</span>}
          </div>
          <p className="mono small muted">{moves.length ? moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ') : 'Make a move or pick a continuation.'}</p>
          {opening && !exact && <p className="small faint" style={{ marginTop: 6 }}>Out of the named lines — last known: {opening.name}.</p>}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="btn sm" disabled={!moves.length} onClick={() => setSaveOpen((v) => !v)}>Add to repertoire</button>
            <button
              className="btn sm ghost"
              disabled={!gate.allowed}
              title={gate.allowed ? undefined : gate.reason}
              onClick={() => {
                setStatsError(null);
                fetchLichessExplorer(fen).then(setStats).catch((e) => setStatsError((e as Error).message));
              }}
            >
              Load Lichess statistics (online)
            </button>
          </div>
          {saveOpen && (
            <div className="row wrap" style={{ marginTop: 10 }}>
              <input className="input" style={{ flex: 1, minWidth: 160 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Line name" />
              <select className="select" style={{ width: 'auto' }} value={color} onChange={(e) => setColor(e.target.value as 'w' | 'b')}>
                <option value="w">For White</option>
                <option value="b">For Black</option>
              </select>
              <button
                className="btn primary sm"
                onClick={async () => {
                  const now = Date.now();
                  await putRepertoireLine({ id: uid('rep'), color, name: name || 'Untitled line', moves, notes: '', createdAt: now, updatedAt: now });
                  setSaved(true);
                  setSaveOpen(false);
                }}
              >
                Save
              </button>
            </div>
          )}
          {saved && <p className="small" style={{ color: 'var(--green)', marginTop: 8 }}>Saved to your repertoire.</p>}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Known continuations</h2>
            <span className="small faint">{next.length ? 'Named lines that continue from here' : ''}</span>
          </div>
          {next.length ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {next.map((c) => (
                    <tr key={c.san} style={{ cursor: 'pointer' }} onClick={() => setMoves([...moves, c.san])}>
                      <td className="mono" style={{ width: 70, fontWeight: 600 }}>{c.san}</td>
                      <td className="muted">{c.openings[0].name}{c.openings.length > 1 ? <span className="faint"> +{c.openings.length - 1} more</span> : null}</td>
                      <td className="mono faint" style={{ width: 50 }}>{c.openings[0].eco}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small muted">No named continuations in the database from this position.</p>
          )}
          <p className="small faint" style={{ marginTop: 8 }}>Names and ECO codes: {OPENINGS_SOURCE}. These are names, not statistics.</p>
        </div>

        {(stats || statsError) && (
          <div className="card">
            <div className="card-head">
              <h2>Game statistics</h2>
            </div>
            {statsError ? (
              <div className="notice error"><IconAlert /><span>{statsError}</span></div>
            ) : stats && (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Move</th><th>Games</th><th>White / Draw / Black</th></tr></thead>
                    <tbody>
                      {stats.moves.slice(0, 10).map((m) => {
                        const t = m.white + m.draws + m.black;
                        return (
                          <tr key={m.san}>
                            <td className="mono">{m.san}</td>
                            <td className="mono">{t.toLocaleString()}</td>
                            <td>
                              <div className="wdl" style={{ height: 10 }}>
                                <div style={{ width: `${(m.white / t) * 100}%`, background: '#e9e9e6' }} />
                                <div className="d" style={{ width: `${(m.draws / t) * 100}%` }} />
                                <div style={{ width: `${(m.black / t) * 100}%`, background: '#3a3d42' }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="small faint" style={{ marginTop: 8 }}>Source: {stats.source}.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Repertoire({ openInExplorer }: { openInExplorer: (moves: string[]) => void }) {
  const [lines, setLines] = useState<RepertoireLine[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => void listRepertoire().then((l) => setLines(l.sort((a, b) => a.name.localeCompare(b.name))));
  useEffect(load, []);

  const download = (content: string, filename: string, type: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importText = async (text: string) => {
    try {
      const imported = parseRepertoire(text);
      for (const l of imported) await putRepertoireLine(l);
      setMessage(`Imported ${imported.length} line${imported.length === 1 ? '' : 's'}.`);
      load();
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap spread">
        <p className="muted">Save lines from the Explorer, add notes, and drill them in Practice → Opening quiz.</p>
        <div className="row wrap">
          <button className="btn sm" disabled={!lines.length} onClick={() => download(repertoireToPgn(lines), 'chessy-repertoire.pgn', 'application/x-chess-pgn')}>Export PGN</button>
          <button className="btn sm" disabled={!lines.length} onClick={() => download(JSON.stringify(lines.map(({ color, name, moves, notes }) => ({ color, name, moves, notes })), null, 2), 'chessy-repertoire.json', 'application/json')}>Export JSON</button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept=".pgn,.json,text/plain,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(importText); e.target.value = ''; }} />
          <Link className="btn sm primary" to="/practice?tab=openings">Drill my repertoire</Link>
        </div>
      </div>
      {message && <p className="small muted">{message}</p>}
      {(['w', 'b'] as const).map((color) => {
        const mine = lines.filter((l) => l.color === color);
        return (
          <div key={color} className="card">
            <div className="card-head">
              <h2>As {color === 'w' ? 'White' : 'Black'}</h2>
              <span className="small faint">{mine.length} line{mine.length === 1 ? '' : 's'}</span>
            </div>
            {mine.length ? (
              <div className="stack">
                {mine.map((l) => (
                  <div key={l.id} className="block stack" style={{ gap: 6 }}>
                    <div className="row spread">
                      <strong>{l.name}</strong>
                      <div className="row">
                        <button className="btn sm ghost" onClick={() => openInExplorer(l.moves)}>Open</button>
                        <button className="btn sm ghost danger" aria-label={`Delete ${l.name}`} onClick={async () => { await deleteRepertoireLine(l.id); load(); }}><IconTrash /></button>
                      </div>
                    </div>
                    <span className="mono small muted">{l.moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ')}</span>
                    <textarea
                      className="textarea"
                      style={{ minHeight: 54, fontFamily: 'var(--font)' }}
                      placeholder="Notes: plans, typical ideas, what to avoid…"
                      defaultValue={l.notes}
                      onBlur={(e) => void putRepertoireLine({ ...l, notes: e.target.value, updatedAt: Date.now() })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">No lines yet. Use the Explorer and press “Add to repertoire”.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Traps() {
  const [id, setId] = useState(TRAPS[0].id);
  const trap = TRAPS.find((t) => t.id === id)!;
  const [ply, setPly] = useState(trap.moves.length);
  useEffect(() => setPly(trap.moves.length), [trap]);
  const fens = useMemo(() => fensForMoves(trap.moves), [trap]);
  return (
    <div className="analysis">
      <div className="stack" style={{ gap: 8 }}>
        <Board fen={fens[ply]} orientation={trap.winner === 'w' ? 'white' : 'black'} id="trap-board" />
        <div className="nav-controls">
          <button className="btn icon" onClick={() => setPly(0)} aria-label="Start"><IconFirst /></button>
          <button className="btn icon" onClick={() => setPly(Math.max(0, ply - 1))} aria-label="Back"><IconChevronLeft /></button>
          <button className="btn icon" onClick={() => setPly(Math.min(trap.moves.length, ply + 1))} aria-label="Forward"><IconChevronRight /></button>
        </div>
      </div>
      <div className="analysis-side">
        <div className="chips">
          {TRAPS.map((t) => (
            <button key={t.id} className="chip" style={t.id === id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setId(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <div className="card stack">
          <div className="row spread">
            <h2>{trap.name}</h2>
            <span className="badge">{trap.opening}</span>
          </div>
          <p className="mono small">
            {trap.moves.map((m, i) => (
              <span key={i} onClick={() => setPly(i + 1)} style={{ cursor: 'pointer', color: i === trap.mistakeAt ? 'var(--red)' : i + 1 === ply ? 'var(--accent)' : undefined, fontWeight: i === trap.mistakeAt ? 700 : undefined }}>
                {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                {m}
                {i === trap.mistakeAt ? '?' : ''}{' '}
              </span>
            ))}
          </p>
          <div className="block">
            <span className="src coach">Coach</span>
            <p style={{ marginTop: 4 }}>{trap.lesson}</p>
          </div>
          <p className="small faint">The move marked in red is the mistake that falls into the trap ({trap.winner === 'w' ? 'Black' : 'White'} errs).</p>
        </div>
      </div>
    </div>
  );
}
