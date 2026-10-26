import { initialLiveStatus, type LiveStatus } from '../lib/fairplay/gate';
import { fetchChessComOngoingPositions } from '../lib/import/chesscom';
import { fetchLichessPlaying } from '../lib/import/lichess';
import { settingsStore } from './settings';
import { createStore } from './store';

export const liveStatusStore = createStore<LiveStatus>(initialLiveStatus);

const LOCK_KEY = 'chessy.selfLockUntil';
try {
  const saved = Number(localStorage.getItem(LOCK_KEY));
  if (saved > Date.now()) liveStatusStore.set((s) => ({ ...s, selfLockUntil: saved }));
} catch {
  /* ignore */
}

/** "I'm playing" mode: locks every engine feature for the given number of minutes. */
export function setSelfLock(minutes: number | null) {
  const until = minutes ? Date.now() + minutes * 60_000 : null;
  try {
    if (until) localStorage.setItem(LOCK_KEY, String(until));
    else localStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
  liveStatusStore.set((s) => ({ ...s, selfLockUntil: until }));
}

let timer: ReturnType<typeof setInterval> | null = null;
let tick = 0;

export async function refreshLiveStatus(): Promise<void> {
  const s = settingsStore.get();
  if (!s.liveStatusChecks) {
    liveStatusStore.set((st) => ({ ...st, lichessPlaying: null, ongoingDailyPositions: [], checkError: undefined }));
    return;
  }
  const errors: string[] = [];
  let lichessPlaying: boolean | null = null;
  let positions = liveStatusStore.get().ongoingDailyPositions;
  if (s.lichessUsername) {
    try {
      lichessPlaying = await fetchLichessPlaying(s.lichessUsername);
    } catch (e) {
      errors.push(`Lichess: ${(e as Error).message}`);
    }
  }
  // Daily games change slowly; refresh them every 5th tick (~5 minutes).
  if (s.chesscomUsername && tick % 5 === 0) {
    try {
      positions = await fetchChessComOngoingPositions(s.chesscomUsername);
    } catch (e) {
      errors.push(`Chess.com: ${(e as Error).message}`);
    }
  }
  tick++;
  liveStatusStore.set((st) => ({
    ...st,
    lichessPlaying,
    ongoingDailyPositions: positions,
    lastChecked: Date.now(),
    checkError: errors.length ? errors.join(' · ') : undefined,
  }));
}

export function startLiveStatusMonitor() {
  if (timer) return;
  void refreshLiveStatus();
  timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void refreshLiveStatus();
  }, 60_000);
  // Expire self-lock promptly.
  setInterval(() => {
    const { selfLockUntil } = liveStatusStore.get();
    if (selfLockUntil && selfLockUntil <= Date.now()) setSelfLock(null);
  }, 5_000);
}
