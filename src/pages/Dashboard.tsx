import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FairPlayCard } from '../components/FairPlay';
import { GameList } from '../components/GameList';
import { IconBulb, IconUpload } from '../components/Icons';
import { computeStats, pct, MIN_GAMES_FOR_REPORT } from '../lib/stats/aggregate';
import { dataStore } from '../state/data';
import { settingsStore } from '../state/settings';
import { useStore } from '../state/store';

export default function Dashboard() {
  const { games, analyses, loaded } = useStore(dataStore);
  const settings = useStore(settingsStore);
  const stats = useMemo(() => computeStats(games, [...analyses.values()]), [games, analyses]);
  const unanalyzed = games.filter((g) => !analyses.has(g.id)).length;
  const total = stats.results.win + stats.results.draw + stats.results.loss;

  const recommendation = (() => {
    if (!games.length)
      return {
        title: 'Import your first games',
        body: 'Paste a PGN or connect your Chess.com / Lichess username to pull in completed games. Everything stays on this device.',
        cta: { to: '/games', label: 'Import games' },
      };
    if (stats.analyzedGames < Math.min(MIN_GAMES_FOR_REPORT, games.length))
      return {
        title: `Analyze ${Math.min(unanalyzed, MIN_GAMES_FOR_REPORT - stats.analyzedGames)} more game${unanalyzed === 1 ? '' : 's'}`,
        body: `Chessy needs at least ${MIN_GAMES_FOR_REPORT} analyzed games with your colour known before it can spot recurring weaknesses.`,
        cta: { to: '/games', label: 'Choose a game' },
      };
    const top = stats.weaknesses[0];
    if (top)
      return {
        title: `Focus: ${top.title.toLowerCase()}`,
        body: `${top.description} Seen ${top.count} times across ${top.gamesAffected} of your analyzed games. ${top.exercises[0]}`,
        cta: { to: '/practice', label: 'Start training' },
      };
    return {
      title: 'Keep your tactics sharp',
      body: 'No recurring weakness stands out yet — great. A short daily puzzle session keeps pattern recognition fresh.',
      cta: { to: '/practice', label: 'Solve puzzles' },
    };
  })();

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>Welcome back{settings.chesscomUsername || settings.lichessUsername ? `, ${settings.chesscomUsername || settings.lichessUsername}` : ''}</h1>
          <p>Review completed games, train your weak spots, and track how you improve.</p>
        </div>
        <div className="row">
          <Link className="btn" to="/analyze">
            Paste a PGN
          </Link>
          <Link className="btn primary" to="/games">
            <IconUpload /> Import games
          </Link>
        </div>
      </div>

      <div className="split">
        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          <div className="card" style={{ borderColor: 'var(--accent-soft)', background: 'linear-gradient(180deg, var(--accent-soft), transparent 70%), var(--surface)' }}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
              <div style={{ color: 'var(--accent)', marginTop: 2 }}>
                <IconBulb width={22} height={22} />
              </div>
              <div className="stack" style={{ gap: 6, flex: 1 }}>
                <span className="small muted" style={{ fontWeight: 600 }}>Training recommendation</span>
                <h2 style={{ fontSize: 17 }}>{recommendation.title}</h2>
                <p className="muted">{recommendation.body}</p>
              </div>
              <Link className="btn primary" to={recommendation.cta.to}>
                {recommendation.cta.label}
              </Link>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Recent games</h2>
              <Link to="/games" className="small">
                View all
              </Link>
            </div>
            {!loaded ? (
              <div className="spinner" />
            ) : games.length ? (
              <GameList games={games.slice(0, 6)} analyses={analyses} compact />
            ) : (
              <div className="empty">
                <h3>No games yet</h3>
                <p>Import completed games to see them here.</p>
              </div>
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <h2>Performance</h2>
              <Link to="/progress" className="small">
                Details
              </Link>
            </div>
            {total ? (
              <div className="stack">
                <div className="grid grid-3" style={{ gap: 8 }}>
                  <div className="stat">
                    <span className="v" style={{ color: 'var(--green)' }}>{pct(stats.results.win, total)}</span>
                    <span className="k">Wins</span>
                  </div>
                  <div className="stat">
                    <span className="v">{pct(stats.results.draw, total)}</span>
                    <span className="k">Draws</span>
                  </div>
                  <div className="stat">
                    <span className="v" style={{ color: 'var(--red)' }}>{pct(stats.results.loss, total)}</span>
                    <span className="k">Losses</span>
                  </div>
                </div>
                <div className="wdl">
                  <div className="w" style={{ width: pct(stats.results.win, total) }} />
                  <div className="d" style={{ width: pct(stats.results.draw, total) }} />
                  <div className="l" style={{ width: pct(stats.results.loss, total) }} />
                </div>
                <div className="divider" style={{ margin: '4px 0' }} />
                <div className="grid grid-2" style={{ gap: 8 }}>
                  <div className="stat">
                    <span className="v">{stats.accuracy !== undefined ? `${stats.accuracy}%` : '—'}</span>
                    <span className="k">Avg. accuracy ({stats.analyzedGames} analyzed)</span>
                  </div>
                  <div className="stat">
                    <span className="v">{stats.ratePerGame ? stats.ratePerGame.blunders : '—'}</span>
                    <span className="k">Blunders per game</span>
                  </div>
                </div>
                <p className="small faint">
                  Based on {total} game{total === 1 ? '' : 's'} where your colour is known. Not a rating estimate.
                </p>
              </div>
            ) : (
              <p className="muted small">
                Results appear once you import games and Chessy knows which side you played (add your usernames in{' '}
                <Link to="/settings">Settings</Link>).
              </p>
            )}
          </div>
          <FairPlayCard />
        </div>
      </div>
    </div>
  );
}
