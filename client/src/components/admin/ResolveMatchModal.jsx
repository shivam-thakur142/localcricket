import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.js';

export function ResolveMatchModal({ match, userId, onClose, onMatchResolved }) {
  const [actionType, setActionType] = useState('COMPLETE'); // 'COMPLETE' | 'ABANDON'

  // Completion fields
  const [resultType, setResultType] = useState('WIN_DEFEND'); // 'WIN_DEFEND' | 'WIN_CHASE' | 'TIED'
  const [winnerTeamId, setWinnerTeamId] = useState(match.team_a_id);
  const [marginRuns, setMarginRuns] = useState('');
  const [marginWickets, setMarginWickets] = useState('');
  const [potmId, setPotmId] = useState('');

  // Abandonment field
  const [abandonmentReason, setAbandonmentReason] = useState('Persistent rain and unplayable outfield conditions');

  // Squads for POTM selection
  const [playingXiPlayers, setPlayingXiPlayers] = useState([]);
  const [isLoadingSquads, setIsLoadingSquads] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSquads();
  }, [match.id]);

  const loadSquads = async () => {
    setIsLoadingSquads(true);
    try {
      const res = await api.getMatchSquads(match.id);
      const teamA_xi = res.data?.team_a?.playing_xi || [];
      const teamB_xi = res.data?.team_b?.playing_xi || [];
      const combined = [
        ...teamA_xi.map((p) => ({ ...p, team_name: res.data?.team_a?.team_name })),
        ...teamB_xi.map((p) => ({ ...p, team_name: res.data?.team_b?.team_name })),
      ];
      setPlayingXiPlayers(combined);
    } catch {
      // Squads might not be set yet if match was cancelled before toss
      setPlayingXiPlayers([]);
    } finally {
      setIsLoadingSquads(false);
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      let payload;
      if (actionType === 'ABANDON') {
        payload = {
          status: 'ABANDONED',
          resultType: 'NO_RESULT',
          abandonmentReason,
        };
      } else {
        payload = {
          status: 'COMPLETED',
          resultType,
          winnerTeamId: resultType === 'TIED' ? null : winnerTeamId,
          resultMarginRuns: resultType === 'WIN_DEFEND' && marginRuns ? parseInt(marginRuns) : null,
          resultMarginWickets: resultType === 'WIN_CHASE' && marginWickets ? parseInt(marginWickets) : null,
          playerOfTheMatchId: potmId || null,
        };
      }

      const res = await api.resolveMatch(match.id, payload, userId);
      if (onMatchResolved) {
        onMatchResolved(res.data);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to resolve match');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '540px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem' }}>
            ⚖️ Resolve Match Lifecycle
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: '0.85rem', color: '#94a3b8', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
          Match #{match.match_number}: {match.team_a_name || 'Team A'} vs {match.team_b_name || 'Team B'}
        </div>

        {error && (
          <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {/* Action Toggle */}
        <div style={{ display: 'flex', gap: '8px', background: '#1e293b', padding: '4px', borderRadius: '8px' }}>
          <button
            type="button"
            onClick={() => setActionType('COMPLETE')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: actionType === 'COMPLETE' ? '#0284c7' : 'transparent',
              color: actionType === 'COMPLETE' ? '#ffffff' : '#94a3b8',
            }}
          >
            🏁 Complete Match
          </button>
          <button
            type="button"
            onClick={() => setActionType('ABANDON')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: actionType === 'ABANDON' ? '#ef4444' : 'transparent',
              color: actionType === 'ABANDON' ? '#ffffff' : '#94a3b8',
            }}
          >
            🌧️ Abandon Match
          </button>
        </div>

        <form onSubmit={handleResolve} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {actionType === 'ABANDON' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#451a03', border: '1px solid #92400e', color: '#fef3c7', padding: '12px', borderRadius: '8px', fontSize: '0.85rem' }}>
                <strong>⚠️ Match Abandonment Notice:</strong>
                <p style={{ margin: '4px 0 0 0' }}>
                  Operational status will become <strong>ABANDONED</strong> with competition result <strong>NO_RESULT</strong>.
                  Both teams will be awarded tournament points for a no-result, and strictly 0 runs and 0 overs will be added to NRR.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Reason for Abandonment
                </label>
                <textarea
                  rows={3}
                  required
                  value={abandonmentReason}
                  onChange={(e) => setAbandonmentReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Result Type
                </label>
                <select
                  value={resultType}
                  onChange={(e) => setResultType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="WIN_DEFEND">Won by Runs (Defended)</option>
                  <option value="WIN_CHASE">Won by Wickets (Chased)</option>
                  <option value="TIED">Tied Match</option>
                </select>
              </div>

              {resultType !== 'TIED' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
                      Winning Team
                    </label>
                    <select
                      value={winnerTeamId}
                      onChange={(e) => setWinnerTeamId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '0.85rem',
                      }}
                    >
                      <option value={match.team_a_id}>{match.team_a_name || 'Team A'}</option>
                      <option value={match.team_b_id}>{match.team_b_name || 'Team B'}</option>
                    </select>
                  </div>

                  {resultType === 'WIN_DEFEND' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
                        Winning Margin (Runs)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={marginRuns}
                        onChange={(e) => setMarginRuns(e.target.value)}
                        placeholder="e.g. 24"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                  )}

                  {resultType === 'WIN_CHASE' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
                        Winning Margin (Wickets)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={marginWickets}
                        onChange={(e) => setMarginWickets(e.target.value)}
                        placeholder="e.g. 6"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Player of the Match (Optional, must be in Playing XI) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Player of the Match (Must belong to confirmed Playing XI)
                </label>
                <select
                  value={potmId}
                  onChange={(e) => setPotmId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="">None / To be decided</option>
                  {playingXiPlayers.map((p) => (
                    <option key={p.player_id} value={p.player_id}>
                      {p.full_name} ({p.team_name})
                    </option>
                  ))}
                </select>
                {playingXiPlayers.length === 0 && !isLoadingSquads && (
                  <span style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '4px', display: 'block' }}>
                    Note: Playing XI was not confirmed for this match. POTM cannot be assigned.
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: '#334155',
                border: 'none',
                borderRadius: '6px',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '8px 18px',
                background: actionType === 'ABANDON' ? '#ef4444' : '#10b981',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isSubmitting ? 'Resolving...' : actionType === 'ABANDON' ? 'Confirm Abandonment' : 'Confirm Resolution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
