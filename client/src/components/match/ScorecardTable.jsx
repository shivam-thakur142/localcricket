import React, { useState } from 'react';

export function ScorecardTable({ scorecard, scorecards: propScorecards, onSelectPlayer, onSelectTeam }) {
  // Support either single innings, array of innings, or wrapper { match, scorecards }
  let inningsList = [];
  if (Array.isArray(propScorecards)) {
    inningsList = propScorecards;
  } else if (scorecard?.scorecards && Array.isArray(scorecard.scorecards)) {
    inningsList = scorecard.scorecards;
  } else if (Array.isArray(scorecard)) {
    inningsList = scorecard;
  } else if (scorecard?.innings) {
    inningsList = [scorecard];
  }

  const [activeInningsIdx, setActiveInningsIdx] = useState(0);

  if (!inningsList || inningsList.length === 0) {
    return (
      <div className="card" style={{ padding: '16px', background: 'var(--bg-card)', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No scorecard data available yet.
      </div>
    );
  }

  // Ensure active index is within bounds
  const currentIdx = activeInningsIdx < inningsList.length ? activeInningsIdx : 0;
  const currentInningsData = inningsList[currentIdx];

  const {
    innings = {},
    batting = [],
    bowling = [],
    extras_breakdown = {},
    did_not_bat = [],
    fall_of_wickets = [],
  } = currentInningsData || {};

  const eb = extras_breakdown || {};
  const oversCompleted = innings.total_legal_balls ? `${Math.floor(innings.total_legal_balls / 6)}.${innings.total_legal_balls % 6}` : '0.0';

  return (
    <div className="card" style={{ padding: '16px', background: 'var(--bg-card)' }}>
      {/* Dual-Innings Navigation Tabs (if more than 1 innings available) */}
      {inningsList.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          {inningsList.map((sc, idx) => {
            const inn = sc.innings || {};
            const teamName = inn.batting_team_name || `Innings ${inn.innings_number || idx + 1}`;
            const innScore = `${inn.total_runs ?? 0}/${inn.total_wickets ?? 0}`;
            const innOvers = inn.total_legal_balls ? `(${Math.floor(inn.total_legal_balls / 6)}.${inn.total_legal_balls % 6} ov)` : '';
            const isActive = currentIdx === idx;

            return (
              <button
                key={inn.id || idx}
                type="button"
                onClick={() => setActiveInningsIdx(idx)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  background: isActive ? '#0284c7' : 'var(--bg-accent)',
                  color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{teamName}:</span>
                <span style={{ color: isActive ? '#f8fafc' : 'var(--text-muted)' }}>{innScore} {innOvers}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Innings Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#38bdf8' }}>
          {innings.batting_team_name ? (
            onSelectTeam && innings.batting_team_id ? (
              <button
                type="button"
                onClick={() => onSelectTeam(innings.batting_team_id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#38bdf8',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {innings.batting_team_name} Innings
              </button>
            ) : (
              `${innings.batting_team_name} Innings`
            )
          ) : (
            `Innings #${innings.innings_number || 1} Scorecard`
          )}
        </h3>

        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
          {innings.total_runs ?? 0}/{innings.total_wickets ?? 0}{' '}
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({oversCompleted} ov)</span>
        </div>
      </div>

      {/* Batting Table */}
      <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '8px 4px' }}>Batter</th>
              <th style={{ padding: '8px 4px' }}>Dismissal</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>R</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>B</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>4s</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>6s</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>SR</th>
            </tr>
          </thead>
          <tbody>
            {batting.map((b) => {
              const pName = b.full_name || b.player_name || b.name || 'Batter';
              const isOut = b.is_out;
              const dismissalText = isOut ? (b.dismissal_text || b.wicket_type || 'out') : 'not out';

              return (
                <tr key={b.player_id || b.id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                  <td style={{ padding: '8px 4px', fontWeight: 700, color: '#f8fafc' }}>
                    {onSelectPlayer && (b.player_id || b.id) ? (
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(b.player_id || b.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#f8fafc',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'left',
                          textDecoration: 'underline',
                        }}
                      >
                        {pName}
                      </button>
                    ) : (
                      pName
                    )}
                  </td>
                  <td style={{ padding: '8px 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {dismissalText}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                    {b.runs_scored}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {b.balls_faced}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {b.fours}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {b.sixes}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: '#38bdf8' }}>
                    {b.balls_faced > 0 ? ((b.runs_scored / b.balls_faced) * 100).toFixed(1) : '0.0'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Extras Summary Line */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 4px',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span>
            Extras: <strong style={{ color: '#f8fafc' }}>{eb.total || innings.total_extras || 0}</strong>{' '}
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              (b {eb.byes || 0}, lb {eb.leg_byes || 0}, w {eb.wides || 0}, nb {eb.no_balls || 0}
              {eb.penalty > 0 ? `, pen ${eb.penalty}` : ''})
            </span>
          </span>
          <span>
            Total:{' '}
            <strong style={{ color: '#f8fafc', fontSize: '1rem' }}>
              {innings.total_runs ?? 0}/{innings.total_wickets ?? 0}
            </strong>{' '}
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              ({oversCompleted} ov)
            </span>
          </span>
        </div>

        {/* Did Not Bat */}
        {did_not_bat && did_not_bat.length > 0 && (
          <div style={{ padding: '8px 4px', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Did Not Bat: </span>
            {did_not_bat.map((p, idx) => (
              <span key={p.player_id || idx}>
                {onSelectPlayer && p.player_id ? (
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(p.player_id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--text-secondary)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    {p.full_name}
                  </button>
                ) : (
                  p.full_name
                )}
                {idx < did_not_bat.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Fall of Wickets */}
        {fall_of_wickets && fall_of_wickets.length > 0 && (
          <div style={{ padding: '8px 4px', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
            <span style={{ fontWeight: 700, color: '#ef4444' }}>Fall of Wickets: </span>
            {fall_of_wickets
              .map(
                (fow, idx) =>
                  `${fow.runs_batter + fow.runs_extras || '?'}-${idx + 1} (${fow.dismissed_player_name || 'batter'}, ${fow.over_number || '?'}.${fow.legal_ball_number || '?'})`
              )
              .join(', ')}
          </div>
        )}
      </div>

      {/* Bowling Table */}
      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px', color: '#94a3b8' }}>
        Bowling
      </h4>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '8px 4px' }}>Bowler</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>O</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>M</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>R</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>W</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Econ</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>WD</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>NB</th>
            </tr>
          </thead>
          <tbody>
            {bowling.map((bw) => {
              const overs = `${Math.floor(bw.legal_balls_bowled / 6)}.${bw.legal_balls_bowled % 6}`;
              const econ = bw.legal_balls_bowled > 0 ? (bw.runs_conceded / (bw.legal_balls_bowled / 6)).toFixed(2) : '0.00';
              const bwName = bw.full_name || bw.player_name || bw.name || 'Bowler';

              return (
                <tr key={bw.player_id || bw.id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                  <td style={{ padding: '8px 4px', fontWeight: 600, color: '#f8fafc' }}>
                    {onSelectPlayer && (bw.player_id || bw.id) ? (
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(bw.player_id || bw.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#f8fafc',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left',
                          textDecoration: 'underline',
                        }}
                      >
                        {bwName}
                      </button>
                    ) : (
                      bwName
                    )}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-secondary)' }}>{overs}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-secondary)' }}>{bw.maidens || 0}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: '#f8fafc', fontWeight: 600 }}>{bw.runs_conceded}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{bw.wickets}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: '#38bdf8' }}>{econ}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-muted)' }}>{bw.wides || 0}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-muted)' }}>{bw.no_balls || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
