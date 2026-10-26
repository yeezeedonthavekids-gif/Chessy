import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarList, TrendChart, WdlRow } from '../components/Charts';
import { IconInfo } from '../components/Icons';
import { MIN_GAMES_FOR_REPORT, computeStats, pct, weeklyPlan } from '../lib/stats/aggregate';
import { formatDate } from '../lib/format';
import { dataStore } from '../state/data';
import { useStore } from '../state/store';

export default function Progress() {
  const { games, analyses } = useStore(dataStore);
  const stats = useMemo(() => computeStats(games, [...analyses.values()]), [games, analyses]);
  const plan = useMemo(() => weeklyPlan(stats), [stats]);
  const gameById = new Map(games.map((g) => [g.id, g]));

  if (!stats.knownColorGames) {
    return (
      <div className="page fade-in">
        <div className="page-head"><div><h1>Progress</h1><p>Your performance across imported, completed games.</p></div></div>
        <div className="card empty">
          <h3>Nothing to measure yet</h3>
          <p>
            Import games and make sure Chessy knows which side you played — add your usernames in <Link to="/settings">Settings</Link> or choose your colour when pasting a PGN.
          </p>
        </div>
      </div>
    );
  }

  const phaseRows = (['opening', 'middlegame', 'endgame'] as const)
    .filter((p) => stats.phaseLoss[p])
    .map((p) => ({ label: p[0].toUpperCase() + p.slice(1), value: stats.phaseLoss[p]!.avgCpLoss, note: `${stats.phaseLoss[p]!.errors} mistakes/blunders in ${stats.phaseLoss[p]!.moves} moves` }));

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1>Progress</h1>
          <p>
            {stats.knownColorGames} games with your colour known · {stats.analyzedGames} analyzed by Stockfish. Figures describe these games only — they are not a rating estimate.
          </p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat"><span className="v">{stats.accuracy !== undefined ? `${stats.accuracy}%` : '—'}</span><span className="k">Average accuracy</span></div>
        <div className="card stat"><span className="v">{stats.acpl ?? '—'}</span><span className="k">Avg. centipawn loss per move</span></div>
        <div className="card stat"><span className="v">{stats.ratePerGame?.blunders ?? '—'}</span><span className="k">Blunders per game</span></div>
        <div className="card stat"><span className="v">{stats.ratePerGame?.mistakes ?? '—'}</span><span className="k">Mistakes per game</span></div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card stack">
          <h2>Results</h2>
          <WdlRow label="All games" wdl={stats.results} />
          <WdlRow label="As White" wdl={stats.asWhite} />
          <WdlRow label="As Black" wdl={stats.asBlack} />
        </div>

        <div className="card">
          <div className="card-head"><h2>Accuracy over time</h2><span className="small faint">Per analyzed game</span></div>
          {stats.perGame.length >= 2 ? (
            <TrendChart
              label="Accuracy per analyzed game"
              points={stats.perGame.map((p) => {
                const g = gameById.get(p.gameId);
                return { x: p.playedAt, y: p.accuracy, tip: `${p.accuracy}% · ${g ? `${g.white} – ${g.black}` : ''} · ${formatDate(p.playedAt)} · ${p.blunders} blunder${p.blunders === 1 ? '' : 's'}` };
              })}
            />
          ) : (
            <p className="small muted">Analyze at least two games to see a trend.</p>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h2>By game phase</h2><span className="small faint">Avg. centipawn loss per move (lower is better)</span></div>
          {phaseRows.length ? <BarList rows={phaseRows} format={(v) => `${v}`} /> : <p className="small muted">Analyze games to see this.</p>}
        </div>

        <div className="card stack">
          <h2>Endgames & time</h2>
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div className="stat">
              <span className="v">{stats.endgame.winningReached ? pct(stats.endgame.winningConverted, stats.endgame.winningReached) : '—'}</span>
              <span className="k">Winning endgames converted ({stats.endgame.winningConverted}/{stats.endgame.winningReached})</span>
            </div>
            <div className="stat">
              <span className="v">{stats.endgame.losingReached ? pct(stats.endgame.losingSaved, stats.endgame.losingReached) : '—'}</span>
              <span className="k">Losing endgames saved ({stats.endgame.losingSaved}/{stats.endgame.losingReached})</span>
            </div>
          </div>
          <div className="divider" style={{ margin: 0 }} />
          {stats.time ? (
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="stat"><span className="v">{stats.time.avgSecondsPerMove}s</span><span className="k">Average time per move ({stats.time.gamesWithClock} games with clock data)</span></div>
              <div className="stat">
                <span className="v">{stats.time.errorsUnderPressure}</span>
                <span className="k">Mistakes/blunders in time trouble ({stats.time.movesUnderPressure} moves played under 30s or 10% of base)</span>
              </div>
            </div>
          ) : (
            <p className="small muted">No clock data — games imported from Chess.com/Lichess usually include it ([%clk] annotations).</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Openings</h2><span className="small faint">From the games' opening headers</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Opening</th><th>Games</th><th>Win</th><th>Draw</th><th>Loss</th><th>Avg. accuracy</th></tr></thead>
            <tbody>
              {stats.openings.slice(0, 12).map((o) => (
                <tr key={o.name}>
                  <td>{o.eco && <span className="mono faint">{o.eco} </span>}{o.name}</td>
                  <td className="mono">{o.games}</td>
                  <td className="mono">{pct(o.win, o.win + o.draw + o.loss)}</td>
                  <td className="mono">{pct(o.draw, o.win + o.draw + o.loss)}</td>
                  <td className="mono">{pct(o.loss, o.win + o.draw + o.loss)}</td>
                  <td className="mono">{o.avgAccuracy !== undefined ? `${o.avgAccuracy}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stats.openings.some((o) => o.games < 3) && <p className="small faint" style={{ marginTop: 8 }}>Openings with fewer than 3 games say little on their own.</p>}
      </div>

      <h2 style={{ margin: '28px 0 12px', fontSize: 18 }}>Personal report</h2>
      {!stats.sufficient ? (
        <div className="notice info">
          <IconInfo />
          <span>
            The weakness report needs at least {MIN_GAMES_FOR_REPORT} analyzed games with your colour known (you have {stats.analyzedGames}). With fewer games, “recurring” patterns would just be noise.
          </span>
        </div>
      ) : stats.weaknesses.length === 0 ? (
        <div className="notice ok"><IconInfo /><span>No error pattern repeats across your analyzed games. Keep going!</span></div>
      ) : (
        <div className="grid grid-3" style={{ alignItems: 'start' }}>
          {stats.weaknesses.map((w, i) => (
            <div key={w.motif} className="card stack" style={{ gap: 10 }}>
              <div className="row spread">
                <span className="badge gold">#{i + 1}</span>
                <span className="small faint">{w.count}× in {w.gamesAffected} games</span>
              </div>
              <h3>{w.title}</h3>
              <p className="small muted">{w.description}</p>
              <div>
                <span className="label">Examples from your games</span>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {w.examples.map((e) => (
                    <li key={`${e.gameId}-${e.ply}`}>
                      <Link to={`/analyze/${e.gameId}?ply=${e.ply}`}>{e.label}</Link>
                      {e.bestSan && <span className="faint"> — engine: {e.bestSan}</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="label">Exercises</span>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {w.exercises.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
              <div>
                <span className="label">Study</span>
                <p className="small muted">{w.study.join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Weekly training plan</h2>
          <span className="small faint">{stats.sufficient && stats.weaknesses.length ? 'Built from your top weaknesses' : 'General fundamentals until there is enough data'}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Day</th><th>Focus</th><th>Tasks</th><th>Time</th></tr></thead>
            <tbody>
              {plan.map((d) => (
                <tr key={d.day}>
                  <td style={{ fontWeight: 600 }}>{d.day}</td>
                  <td className="muted">{d.focus}</td>
                  <td className="small">{d.tasks.join(' ')}</td>
                  <td className="mono small">{d.minutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
