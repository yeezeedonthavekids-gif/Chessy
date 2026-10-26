import { useRef, useState } from 'react';
import { parsePgnCollection, PgnError } from '../lib/chess/pgn';
import type { Color, StoredGame } from '../lib/chess/types';
import { importChessComGames } from '../lib/import/chesscom';
import { toStoredGame } from '../lib/import/games';
import { importLichessGames } from '../lib/import/lichess';
import { putGames } from '../lib/storage/db';
import { identifyOpening, loadOpenings } from '../lib/openings/explorer';
import { reloadData } from '../state/data';
import { settingsStore, usernames } from '../state/settings';
import { useStore } from '../state/store';
import { IconAlert, IconCheck, IconInfo, IconUpload } from './Icons';

type Tab = 'paste' | 'file' | 'chesscom' | 'lichess';

export function ImportPanel({ onImported, initialTab = 'paste' }: { onImported?: (games: StoredGame[]) => void; initialTab?: Tab }) {
  const settings = useStore(settingsStore);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pgn, setPgn] = useState('');
  const [side, setSide] = useState<'auto' | Color | 'none'>('auto');
  const [user, setUser] = useState(tab === 'lichess' ? settings.lichessUsername : settings.chesscomUsername);
  const [max, setMax] = useState(25);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const switchTab = (t: Tab) => {
    setTab(t);
    setMessage(null);
    if (t === 'chesscom') setUser(settings.chesscomUsername);
    if (t === 'lichess') setUser(settings.lichessUsername);
  };

  const save = async (games: StoredGame[], skipped: number, errors: string[]) => {
    if (!games.length) {
      setMessage({ kind: 'error', text: errors[0] ?? 'No completed games were found.' });
      return;
    }
    // Name openings from the ECO database when the PGN has no Opening header.
    try {
      const { byEpd } = await loadOpenings();
      for (const g of games) {
        if (g.openingName && g.eco) continue;
        const o = identifyOpening(byEpd, [g.startFen, ...g.plies.slice(0, 30).map((p) => p.fenAfter)]);
        if (o) {
          g.openingName ??= o.name;
          g.eco ??= o.eco;
        }
      }
    } catch {
      /* naming is best-effort */
    }
    await putGames(games);
    await reloadData();
    const unfinished = games.filter((g) => !g.finished).length;
    const parts = [`Imported ${games.length} game${games.length === 1 ? '' : 's'}.`];
    if (skipped) parts.push(`${skipped} could not be read.`);
    if (unfinished) parts.push(`${unfinished} ha${unfinished === 1 ? 's' : 've'} no final result — engine analysis stays locked for ${unfinished === 1 ? 'it' : 'them'}.`);
    setMessage({ kind: 'ok', text: parts.join(' ') });
    onImported?.(games);
  };

  const importText = async (text: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const { games, errors } = parsePgnCollection(text);
      const names = usernames(settings);
      const stored = games.map((g) =>
        toStoredGame(g, 'pgn', names, side === 'auto' ? {} : { userColor: side === 'none' ? null : side }),
      );
      await save(stored, errors.length, errors.map((e) => `Game ${e.index + 1}: ${e.message}`));
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof PgnError ? e.message : `Import failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const importPlatform = async () => {
    const name = user.trim();
    if (!name) {
      setMessage({ kind: 'error', text: 'Enter a username.' });
      return;
    }
    setBusy(true);
    setMessage({ kind: 'info', text: 'Contacting the official public API…' });
    abort.current = new AbortController();
    try {
      const names = usernames(settings);
      const games =
        tab === 'chesscom'
          ? await importChessComGames({ username: name, max, names, signal: abort.current.signal, onProgress: (t) => setMessage({ kind: 'info', text: t }) })
          : await importLichessGames({ username: name, max, names, signal: abort.current.signal });
      // Remember the username so colour detection and live-status checks work.
      settingsStore.set((s) => (tab === 'chesscom' ? { ...s, chesscomUsername: s.chesscomUsername || name } : { ...s, lichessUsername: s.lichessUsername || name }));
      await save(games, 0, []);
    } catch (e) {
      if ((e as Error).name === 'AbortError') setMessage({ kind: 'info', text: 'Import cancelled.' });
      else
        setMessage({
          kind: 'error',
          text: `${(e as Error).message}${(e as Error).message.startsWith('Network') ? ' If you are offline, export a PGN from the site and paste it instead.' : ''}`,
        });
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="tabs" role="tablist">
        {(
          [
            ['paste', 'Paste PGN'],
            ['file', 'Upload file'],
            ['chesscom', 'Chess.com'],
            ['lichess', 'Lichess'],
          ] as const
        ).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {(tab === 'paste' || tab === 'file') && (
        <>
          {tab === 'paste' ? (
            <textarea
              className="textarea"
              placeholder={'[Event "Casual game"]\n[White "You"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 …'}
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              rows={8}
              aria-label="PGN text"
            />
          ) : (
            <div
              className="card"
              style={{ borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-elev)' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void f.text().then(importText);
              }}
            >
              <IconUpload width={22} height={22} style={{ color: 'var(--text-faint)' }} />
              <p style={{ marginTop: 6 }}>Drop a .pgn file here or click to choose</p>
              <p className="small faint">Multi-game files are supported (up to 20 MB).</p>
              <input
                ref={fileRef}
                type="file"
                accept=".pgn,text/plain,application/x-chess-pgn"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void f.text().then(importText);
                  e.target.value = '';
                }}
              />
            </div>
          )}
          <div className="row wrap spread">
            <label className="row small muted">
              I played
              <select className="select" style={{ width: 'auto' }} value={side} onChange={(e) => setSide(e.target.value as typeof side)}>
                <option value="auto">Detect from username</option>
                <option value="w">White</option>
                <option value="b">Black</option>
                <option value="none">Neither (study game)</option>
              </select>
            </label>
            {tab === 'paste' && (
              <button className="btn primary" disabled={busy || !pgn.trim()} onClick={() => void importText(pgn)}>
                {busy ? 'Importing…' : 'Import'}
              </button>
            )}
          </div>
        </>
      )}

      {(tab === 'chesscom' || tab === 'lichess') && (
        <>
          <p className="small muted">
            {tab === 'chesscom'
              ? 'Uses the official Chess.com Published-Data API. Only finished games appear in the public archives. No password or login needed.'
              : 'Uses the official Lichess API game export (finished games only). No password or login needed.'}
          </p>
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label className="label" htmlFor="import-user">
                {tab === 'chesscom' ? 'Chess.com' : 'Lichess'} username
              </label>
              <input id="import-user" className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="username" autoComplete="off" />
            </div>
            <div className="field" style={{ width: 120 }}>
              <label className="label" htmlFor="import-max">
                Games
              </label>
              <select id="import-max" className="select" value={max} onChange={(e) => setMax(Number(e.target.value))}>
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    Last {n}
                  </option>
                ))}
              </select>
            </div>
            {busy ? (
              <button className="btn" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            ) : (
              <button className="btn primary" onClick={() => void importPlatform()}>
                Import
              </button>
            )}
          </div>
        </>
      )}

      {message && (
        <div className={`notice ${message.kind === 'ok' ? 'ok' : message.kind === 'error' ? 'error' : 'info'}`}>
          {message.kind === 'ok' ? <IconCheck /> : message.kind === 'error' ? <IconAlert /> : <IconInfo />}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}
