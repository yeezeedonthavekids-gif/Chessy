import { Link } from 'react-router-dom';
import type { StoredGame } from '../lib/chess/types';
import type { GameAnalysis } from '../lib/analysis/types';
import { userResult } from '../lib/import/games';
import { SOURCE_LABEL, formatDate, opponentOf, timeControlLabel } from '../lib/format';

export function GameList({
  games,
  analyses,
  compact = false,
  onDelete,
}: {
  games: StoredGame[];
  analyses: Map<string, GameAnalysis>;
  compact?: boolean;
  onDelete?: (g: StoredGame) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 18 }} />
            <th>{compact ? 'Opponent' : 'Players'}</th>
            {!compact && <th>Opening</th>}
            <th>Result</th>
            <th>Accuracy</th>
            {!compact && <th>Source</th>}
            <th>Date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {games.map((g) => {
            const r = userResult(g);
            const a = analyses.get(g.id);
            const mine = a && g.userColor ? (g.userColor === 'w' ? a.white : a.black) : null;
            const opp = opponentOf(g);
            return (
              <tr key={g.id}>
                <td>{r && <span className={`result-dot ${r}`} title={r} />}</td>
                <td>
                  <Link to={`/analyze/${g.id}`} className="nowrap" style={{ color: 'var(--text)', fontWeight: 550 }}>
                    {compact && g.userColor ? (
                      <>
                        {opp.name}
                        {opp.elo ? <span className="faint"> ({opp.elo})</span> : null}
                      </>
                    ) : (
                      <>
                        {g.white} <span className="faint">vs</span> {g.black}
                      </>
                    )}
                  </Link>
                  <div className="small faint">
                    {g.userColor ? `You played ${g.userColor === 'w' ? 'White' : 'Black'}` : 'Your colour unknown'}
                    {timeControlLabel(g.timeControl) && ` · ${timeControlLabel(g.timeControl)}`}
                  </div>
                </td>
                {!compact && (
                  <td className="muted" title={g.openingName}>
                    <div style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.eco && <span className="mono faint">{g.eco} </span>}
                      {g.openingName ?? '—'}
                    </div>
                  </td>
                )}
                <td className="mono">{g.result}</td>
                <td>
                  {mine ? (
                    <span className="mono">{mine.accuracy.toFixed(1)}%</span>
                  ) : a ? (
                    <span className="badge">Analyzed</span>
                  ) : (
                    <span className="faint small">Not analyzed</span>
                  )}
                </td>
                {!compact && (
                  <td>
                    <span className="badge">{SOURCE_LABEL[g.source]}</span>
                  </td>
                )}
                <td className="muted small nowrap">{formatDate(g.playedAt, g.date)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Link className="btn sm" to={`/analyze/${g.id}`}>
                    Review
                  </Link>
                  {onDelete && (
                    <button className="btn sm ghost danger" style={{ marginLeft: 4 }} onClick={() => onDelete(g)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
