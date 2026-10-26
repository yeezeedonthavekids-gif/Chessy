import { IconLock } from './Icons';

export function LockedNotice({ reason }: { reason: string }) {
  return (
    <div className="card empty">
      <IconLock width={26} height={26} style={{ color: 'var(--orange)' }} />
      <h3 style={{ marginTop: 8 }}>Training is paused</h3>
      <p style={{ maxWidth: 520, margin: '0 auto' }}>{reason} Puzzles, hints, drills and engine feedback come back automatically when the game ends.</p>
    </div>
  );
}
