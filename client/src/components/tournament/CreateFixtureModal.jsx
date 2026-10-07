import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';

export function CreateFixtureModal({
  isOpen,
  onClose,
  tournamentId,
  teams = [],
  nextMatchNumber = 1,
  defaultOvers = 20,
  onSubmitFixture,
  isSubmitting = false,
}) {
  const [teamAId, setTeamAId] = useState(teams[0]?.tournament_team_id || '');
  const [teamBId, setTeamBId] = useState(teams[1]?.tournament_team_id || '');
  const [matchNumber, setMatchNumber] = useState(nextMatchNumber);
  const [stage, setStage] = useState('LEAGUE');
  const [oversQuota, setOversQuota] = useState(defaultOvers);
  const [scheduledStartTime, setScheduledStartTime] = useState(new Date().toISOString().slice(0, 16));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!teamAId || !teamBId) {
      alert('Please select both Team A and Team B.');
      return;
    }
    if (teamAId === teamBId) {
      alert('Team A and Team B cannot be the same team!');
      return;
    }

    onSubmitFixture({
      team_a_id: teamAId,
      team_b_id: teamBId,
      match_number: parseInt(matchNumber, 10),
      stage,
      overs_quota: parseInt(oversQuota, 10),
      scheduled_start_time: new Date(scheduledStartTime).toISOString(),
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule Tournament Fixture">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Team A */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
            Team A
          </label>
          <select
            value={teamAId}
            onChange={(e) => setTeamAId(e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
          >
            <option value="">-- Select Team A --</option>
            {teams.map((t) => (
              <option key={t.tournament_team_id} value={t.tournament_team_id} disabled={t.tournament_team_id === teamBId}>
                {t.team_name} ({t.short_name})
              </option>
            ))}
          </select>
        </div>

        {/* Team B */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
            Team B
          </label>
          <select
            value={teamBId}
            onChange={(e) => setTeamBId(e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
          >
            <option value="">-- Select Team B --</option>
            {teams.map((t) => (
              <option key={t.tournament_team_id} value={t.tournament_team_id} disabled={t.tournament_team_id === teamAId}>
                {t.team_name} ({t.short_name})
              </option>
            ))}
          </select>
        </div>

        {/* Match Number & Stage */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              Match #
            </label>
            <input
              type="number"
              min={1}
              value={matchNumber}
              onChange={(e) => setMatchNumber(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              Stage
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
            >
              <option value="LEAGUE">League</option>
              <option value="SUPER_FOUR">Super Four</option>
              <option value="QUARTER_FINAL">Quarter-Final</option>
              <option value="SEMI_FINAL">Semi-Final</option>
              <option value="FINAL">Final</option>
            </select>
          </div>
        </div>

        {/* Overs & Date */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              Overs Quota
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={oversQuota}
              onChange={(e) => setOversQuota(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              Start Time
            </label>
            <input
              type="datetime-local"
              value={scheduledStartTime}
              onChange={(e) => setScheduledStartTime(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting} style={{ flex: 1 }}>
            Schedule Match
          </Button>
        </div>
      </form>
    </Modal>
  );
}
