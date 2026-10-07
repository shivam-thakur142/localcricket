import React, { useState } from 'react';
import { api } from '../../services/api.js';

const ALLOWED_TRANSITIONS = {
  DRAFT: ['UPCOMING', 'CANCELLED'],
  UPCOMING: ['ONGOING', 'CANCELLED'],
  ONGOING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function TournamentSettingsForm({ tournament, userId, onTournamentUpdated }) {
  const [status, setStatus] = useState(tournament.status);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Settings form fields
  const [oversPerInnings, setOversPerInnings] = useState(tournament.overs_per_innings || 20);
  const [ballsPerOver, setBallsPerOver] = useState(tournament.balls_per_over || 6);
  const [maxOversPerBowler, setMaxOversPerBowler] = useState(tournament.max_overs_per_bowler || 4);
  const [wideRuns, setWideRuns] = useState(tournament.wide_runs || 1);
  const [noBallRuns, setNoBallRuns] = useState(tournament.no_ball_runs || 1);
  const [freeHit, setFreeHit] = useState(tournament.free_hit_on_no_ball ?? true);
  const [pointsWin, setPointsWin] = useState(tournament.points_for_win || 2);
  const [pointsTie, setPointsTie] = useState(tournament.points_for_tie || 1);
  const [pointsNoResult, setPointsNoResult] = useState(tournament.points_for_no_result || 1);

  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const currentStatus = tournament.status;
  const allowedNextStatuses = ALLOWED_TRANSITIONS[currentStatus] || [];
  const isTerminal = currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED';

  const handleStatusChange = async (newStatus) => {
    setIsUpdatingStatus(true);
    setStatusMessage(null);
    try {
      const res = await api.updateTournamentStatus(tournament.id, newStatus, userId);
      setStatusMessage({ type: 'success', text: `Tournament status transitioned to ${newStatus}` });
      if (onTournamentUpdated) {
        onTournamentUpdated(res.data);
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update status' });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (isTerminal) return;

    setIsSavingSettings(true);
    setStatusMessage(null);
    try {
      const payload = {
        overs_per_innings: parseInt(oversPerInnings),
        balls_per_over: parseInt(ballsPerOver),
        max_overs_per_bowler: parseInt(maxOversPerBowler),
        wide_runs: parseInt(wideRuns),
        no_ball_runs: parseInt(noBallRuns),
        free_hit_on_no_ball: Boolean(freeHit),
        points_for_win: parseInt(pointsWin),
        points_for_tie: parseInt(pointsTie),
        points_for_no_result: parseInt(pointsNoResult),
      };
      const res = await api.updateTournament(tournament.id, payload, userId);
      setStatusMessage({ type: 'success', text: 'Tournament rules & settings updated successfully' });
      if (onTournamentUpdated) {
        onTournamentUpdated(res.data);
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Status & Lifecycle Controller */}
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '10px',
          padding: '20px',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
          🔄 Tournament Lifecycle State Machine
        </h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#94a3b8' }}>
          Transitions follow the strictly enforced workflow: DRAFT → UPCOMING → ONGOING → COMPLETED/CANCELLED.
          Terminal states cannot be undone.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Current Status:</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
              {currentStatus}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {allowedNextStatuses.map((nextStatus) => (
              <button
                key={nextStatus}
                onClick={() => handleStatusChange(nextStatus)}
                disabled={isUpdatingStatus}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: nextStatus === 'CANCELLED' ? '#ef4444' : '#0284c7',
                  color: '#ffffff',
                }}
              >
                Transition to {nextStatus}
              </button>
            ))}

            {isTerminal && (
              <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                🔒 This tournament is in terminal state ({currentStatus}) and is immutable.
              </span>
            )}
          </div>
        </div>

        {statusMessage && (
          <div
            style={{
              marginTop: '16px',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: statusMessage.type === 'success' ? '#064e3b' : '#7f1d1d',
              color: statusMessage.type === 'success' ? '#6ee7b7' : '#fca5a5',
            }}
          >
            {statusMessage.text}
          </div>
        )}
      </div>

      {/* Rules & Configuration Form */}
      <form
        onSubmit={handleSaveSettings}
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '10px',
          padding: '20px',
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
          ⚙️ Playing Conditions & Scoring Rules
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
              Overs Per Innings
            </label>
            <input
              type="number"
              disabled={isTerminal}
              value={oversPerInnings}
              onChange={(e) => setOversPerInnings(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
              Balls Per Over
            </label>
            <input
              type="number"
              disabled={isTerminal}
              value={ballsPerOver}
              onChange={(e) => setBallsPerOver(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
              Max Overs Per Bowler
            </label>
            <input
              type="number"
              disabled={isTerminal}
              value={maxOversPerBowler}
              onChange={(e) => setMaxOversPerBowler(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
              Points for Win
            </label>
            <input
              type="number"
              disabled={isTerminal}
              value={pointsWin}
              onChange={(e) => setPointsWin(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
              Points for Tie
            </label>
            <input
              type="number"
              disabled={isTerminal}
              value={pointsTie}
              onChange={(e) => setPointsTie(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
              Points for No Result
            </label>
            <input
              type="number"
              disabled={isTerminal}
              value={pointsNoResult}
              onChange={(e) => setPointsNoResult(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="freeHitCheck"
            disabled={isTerminal}
            checked={freeHit}
            onChange={(e) => setFreeHit(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="freeHitCheck" style={{ fontSize: '0.85rem', color: '#f8fafc', cursor: 'pointer' }}>
            Free-Hit on No-Balls enabled
          </label>
        </div>

        {!isTerminal && (
          <div style={{ marginTop: '20px' }}>
            <button
              type="submit"
              disabled={isSavingSettings}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                background: '#10b981',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              {isSavingSettings ? 'Saving...' : '💾 Save Playing Rules'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
