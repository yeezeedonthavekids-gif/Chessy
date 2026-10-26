import { useEffect, useState } from 'react';
import { isGloballyLocked, type GateDecision } from '../lib/fairplay/gate';
import { liveStatusStore } from '../state/liveStatus';
import { useStore } from '../state/store';

/** App-wide fair-play lock (live game on Lichess or "I'm playing" mode). */
export function useGlobalLock(): GateDecision {
  const status = useStore(liveStatusStore);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  return isGloballyLocked(status, now);
}
