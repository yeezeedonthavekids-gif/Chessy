import { useState } from 'react';
import { IconAlert, IconCheck } from '../components/Icons';
import { clearMemory, clearStore, deleteEverything, exportAll } from '../lib/storage/db';
import { reloadData } from '../state/data';
import { refreshLiveStatus } from '../state/liveStatus';
import { LEVEL_LABEL, getApiKey, setApiKey, settingsStore, type Settings as S, type SkillLevel } from '../state/settings';
import { useStore } from '../state/store';

export default function Settings() {
  const s = useStore(settingsStore);
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState<string | null>(null);
  const update = (patch: Partial<S>) => settingsStore.set((prev) => ({ ...prev, ...patch }));
  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2500);
  };

  const download = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify({ ...data, settings: { ...s } }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chessy-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page fade-in" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Everything is stored locally in this browser. Chessy has no account and no server.</p>
        </div>
        {saved && (
          <span className="badge green">
            <IconCheck width={12} height={12} /> {saved}
          </span>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <section className="card stack">
          <h2>Profile</h2>
          <div className="grid grid-2">
            <div className="field">
              <label className="label" htmlFor="cc">Chess.com username</label>
              <input id="cc" className="input" value={s.chesscomUsername} onChange={(e) => update({ chesscomUsername: e.target.value.trim() })} placeholder="optional" />
            </div>
            <div className="field">
              <label className="label" htmlFor="li">Lichess username</label>
              <input id="li" className="input" value={s.lichessUsername} onChange={(e) => update({ lichessUsername: e.target.value.trim() })} placeholder="optional" />
            </div>
            <div className="field">
              <label className="label" htmlFor="alias">Other names you play under (comma-separated)</label>
              <input id="alias" className="input" value={s.aliases} onChange={(e) => update({ aliases: e.target.value })} placeholder="e.g. your OTB name" />
            </div>
            <div className="field">
              <label className="label" htmlFor="lvl">Approximate level (adjusts explanations and puzzles)</label>
              <select id="lvl" className="select" value={s.skillLevel} onChange={(e) => update({ skillLevel: e.target.value as SkillLevel })}>
                {(Object.keys(LEVEL_LABEL) as SkillLevel[]).map((l) => (
                  <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="small faint">Usernames are used to tell which side you played and for the fair-play live checks. They are only sent to the matching site's public API.</p>
        </section>

        <section className="card stack">
          <h2>Fair play</h2>
          <label className="check">
            <input type="checkbox" checked={s.liveStatusChecks} onChange={(e) => { update({ liveStatusChecks: e.target.checked }); void refreshLiveStatus(); }} />
            <span>
              <strong>Pause engine features while I'm playing</strong>
              <br />
              <span className="small muted">
                Every minute, Chessy asks Lichess's public status API whether you are in a game and pauses all analysis if so. It also loads the positions of your ongoing Chess.com daily games and refuses to analyse them. Chess.com does not publish live-game status, so for live games there use the “I'm about to play” button on the dashboard.
              </span>
            </span>
          </label>
        </section>

        <section className="card stack">
          <h2>Analysis</h2>
          <div className="grid grid-2">
            <div className="field">
              <label className="label" htmlFor="depth">Default game-review depth</label>
              <select id="depth" className="select" value={s.analysisDepth} onChange={(e) => update({ analysisDepth: Number(e.target.value) })}>
                {[10, 14, 18, 22].map((d) => (
                  <option key={d} value={d}>Depth {d}{d === 14 ? ' (recommended)' : d === 10 ? ' (fast)' : d >= 22 ? ' (slow)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Engine</label>
              <p className="small muted" style={{ paddingTop: 8 }}>Stockfish 17.1 “lite” (WebAssembly, single-threaded) running in a Web Worker on your device. Free and offline.</p>
            </div>
          </div>
        </section>

        <section className="card stack">
          <h2>Appearance</h2>
          <div className="grid grid-2">
            <div className="field">
              <label className="label" htmlFor="theme">Theme</label>
              <select id="theme" className="select" value={s.theme} onChange={(e) => update({ theme: e.target.value as S['theme'] })}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">Match system</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="board">Board colours</label>
              <select id="board" className="select" value={s.boardTheme} onChange={(e) => update({ boardTheme: e.target.value as S['boardTheme'] })}>
                <option value="green">Green</option>
                <option value="brown">Brown</option>
                <option value="blue">Blue</option>
                <option value="slate">Slate</option>
              </select>
            </div>
          </div>
        </section>

        <section className="card stack">
          <h2>AI coach (optional)</h2>
          <p className="small muted">
            The built-in coach works with no API key and no internet. Optionally, connect a language model for free-form conversation. Engine facts are still computed locally and passed to the model; the model's text is labelled as AI-generated and any move it mentions that isn't legal or in the engine lines gets flagged.
          </p>
          <div className="field">
            <label className="label" htmlFor="prov">Provider</label>
            <select id="prov" className="select" value={s.aiProvider} onChange={(e) => update({ aiProvider: e.target.value as S['aiProvider'] })}>
              <option value="none">None — built-in offline coach (free)</option>
              <option value="openai-compatible">Local model via an OpenAI-compatible server (free, e.g. Ollama / LM Studio)</option>
              <option value="anthropic">Anthropic Claude (your own API key — usage is billed to you by Anthropic)</option>
            </select>
          </div>
          {s.aiProvider === 'anthropic' && (
            <div className="grid grid-2">
              <div className="field">
                <label className="label" htmlFor="amodel">Model</label>
                <input id="amodel" className="input" value={s.anthropicModel} onChange={(e) => update({ anthropicModel: e.target.value.trim() })} />
              </div>
            </div>
          )}
          {s.aiProvider === 'openai-compatible' && (
            <div className="grid grid-2">
              <div className="field">
                <label className="label" htmlFor="obase">Base URL</label>
                <input id="obase" className="input" value={s.openaiBaseUrl} onChange={(e) => update({ openaiBaseUrl: e.target.value.trim() })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="omodel">Model</label>
                <input id="omodel" className="input" value={s.openaiModel} onChange={(e) => update({ openaiModel: e.target.value.trim() })} />
              </div>
            </div>
          )}
          {s.aiProvider !== 'none' && (
            <>
              <div className="field">
                <label className="label" htmlFor="key">API key {s.aiProvider === 'openai-compatible' && '(usually not needed for local servers)'}</label>
                <input id="key" className="input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Stored only in this browser" autoComplete="off" />
              </div>
              <label className="check small">
                <input type="checkbox" checked={s.rememberApiKey} onChange={(e) => update({ rememberApiKey: e.target.checked })} />
                <span>Remember the key on this device (otherwise it is forgotten when the tab closes)</span>
              </label>
              <div className="row">
                <button className="btn primary" onClick={() => { setApiKey(key.trim(), s.rememberApiKey); flash('Key saved'); }}>Save key</button>
                <button className="btn ghost" onClick={() => { setApiKey('', false); setKey(''); flash('Key removed'); }}>Remove key</button>
              </div>
              <div className="notice warn">
                <IconAlert />
                <span>
                  Your key is sent directly from this browser to the provider you chose — never to Chessy (there is no Chessy server). Anyone with access to this browser profile could read a remembered key. Never paste a key on a shared computer.
                </span>
              </div>
            </>
          )}
        </section>

        <section className="card stack">
          <h2>Your data</h2>
          <p className="small muted">Games, analyses, repertoire, puzzle history and coach memory live in this browser's IndexedDB. Export them, or delete them at any time.</p>
          <div className="row wrap">
            <button className="btn" onClick={() => void download()}>Export all data (JSON)</button>
            <button className="btn" onClick={async () => { await clearStore('evalCache'); flash('Engine cache cleared'); }}>Clear engine cache</button>
            <button className="btn" onClick={async () => { await clearMemory(); flash('Coach memory cleared'); }}>Clear coach memory</button>
            <button className="btn" onClick={async () => { await clearStore('attempts'); flash('Puzzle history cleared'); }}>Clear puzzle history</button>
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirm('Delete all games, analyses, repertoire and training history from this browser?')) return;
                await deleteEverything();
                await reloadData();
                flash('All data deleted');
              }}
            >
              Delete everything
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
