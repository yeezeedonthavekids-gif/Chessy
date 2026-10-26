import { useEffect, useState } from 'react';
import { isGloballyLocked } from '../lib/fairplay/gate';
import { liveStatusStore, refreshLiveStatus, setSelfLock } from '../state/liveStatus';
import { settingsStore } from '../state/settings';
import { useStore } from '../state/store';
import { IconLock, IconShield } from './Icons';

function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Compact status shown in the sidebar footer. */
export function FairPlayPill({ collapsed }: { collapsed: boolean }) {
  const status = useStore(liveStatusStore);
  const now = useNow();
  const lock = isGloballyLocked(status, now);
  const locked = !lock.allowed;
  return (
    <div
      className={`badge ${locked ? 'orange' : 'green'}`}
      title={locked ? lock.reason : 'Engine features are available for completed games and training positions.'}
      style={{ justifyContent: 'center', padding: collapsed ? '6px' : '4px 10px' }}
    >
      {locked ? <IconLock width={13} height={13} /> : <IconShield width={13} height={13} />}
      {!collapsed && <span className="sidebar-foot-text">{locked ? 'Analysis paused' : 'Fair-play safe'}</span>}
    </div>
  );
}

/** Full card with the "I'm playing" toggle and live-status details. */
export function FairPlayCard() {
  const status = useStore(liveStatusStore);
  const settings = useStore(settingsStore);
  const now = useNow(5000);
  const lock = isGloballyLocked(status, now);
  const selfLocked = status.selfLockUntil !== null && status.selfLockUntil > now;
  const minsLeft = selfLocked ? Math.ceil((status.selfLockUntil! - now) / 60000) : 0;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="row">
          <IconShield width={16} height={16} style={{ color: lock.allowed ? 'var(--green)' : 'var(--orange)' }} />
          Fair play
        </h2>
        <span className={`badge ${lock.allowed ? 'green' : 'orange'}`}>{lock.allowed ? 'Analysis available' : 'Analysis paused'}</span>
      </div>
      <p className="card-sub" style={{ marginBottom: 12 }}>
        Chessy only analyses completed games and standalone training positions. It never reads, overlays or
        interacts with live Chess.com or Lichess games.
      </p>
      {!lock.allowed && (
        <div className="notice warn" style={{ marginBottom: 12 }}>
          <IconLock />
          <span>{lock.reason}</span>
        </div>
      )}
      <div className="row wrap">
        {selfLocked ? (
          <>
            <span className="small muted">“I'm playing” mode — {minsLeft} min left</span>
            <button className="btn sm" onClick={() => setSelfLock(null)}>
              I've finished my game
            </button>
          </>
        ) : (
          <>
            <button className="btn sm" onClick={() => setSelfLock(30)}>
              I'm about to play (30 min)
            </button>
            <button className="btn sm ghost" onClick={() => setSelfLock(90)}>
              90 min
            </button>
          </>
        )}
      </div>
      <div className="divider" />
      <div className="small muted stack" style={{ gap: 4 }}>
        <span>
          Lichess live check:{' '}
          {!settings.liveStatusChecks
            ? 'off'
            : settings.lichessUsername
              ? status.lichessPlaying === null
                ? 'not yet checked'
                : status.lichessPlaying
                  ? 'in a game'
                  : 'not playing'
              : 'add your username in Settings'}
        </span>
        <span>
          Chess.com daily games:{' '}
          {!settings.liveStatusChecks
            ? 'off'
            : settings.chesscomUsername
              ? `${status.ongoingDailyPositions.length ? 'positions from ongoing games are blocked' : 'none ongoing'}`
              : 'add your username in Settings'}
        </span>
        {status.checkError && <span style={{ color: 'var(--orange)' }}>{status.checkError}</span>}
        {settings.liveStatusChecks && (settings.lichessUsername || settings.chesscomUsername) && (
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => void refreshLiveStatus()}>
            Check now
          </button>
        )}
      </div>
    </div>
  );
}
