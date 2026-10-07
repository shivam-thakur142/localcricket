import React, { useState } from 'react';
import { Button } from '../common/Button.jsx';

export function OpenersSetup({
  battingTeamName,
  bowlingTeamName,
  battingTeamId,
  bowlingTeamId,
  battingSquad = [], // Playing XI of batting team
  bowlingSquad = [], // Playing XI of bowling team
  inningsNumber = 1,
  onSubmitOpeners,
  isSubmitting = false,
}) {
  const [strikerId, setStrikerId] = useState(battingSquad[0]?.player_id || '');
  const [nonStrikerId, setNonStrikerId] = useState(battingSquad[1]?.player_id || '');
  const [bowlerId, setBowlerId] = useState(bowlingSquad[0]?.player_id || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!strikerId || !nonStrikerId || !bowlerId) {
      alert('Please select Striker, Non-Striker, and Opening Bowler.');
      return;
    }
    if (strikerId === nonStrikerId) {
      alert('Striker and Non-Striker cannot be the same player!');
      return;
    }

    onSubmitOpeners({
      battingTeamId,
      bowlingTeamId,
      strikerId,
      nonStrikerId,
      bowlerId,
      inningsNumber,
    });
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8', marginBottom: '12px' }}>
        Start Innings #{inningsNumber} — Openers & Bowler
      </h3>

      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        <strong>{battingTeamName}</strong> batting against <strong>{bowlingTeamName}</strong>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Striker */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
            Opening Striker ({battingTeamName})
          </label>
          <select
            value={strikerId}
            onChange={(e) => setStrikerId(e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
          >
            <option value="">-- Select Striker --</option>
            {battingSquad.map((p) => (
              <option key={p.player_id} value={p.player_id} disabled={p.player_id === nonStrikerId}>
                {p.full_name || p.player_name} #{p.jersey_number} {p.player_id === nonStrikerId ? '(Selected as Non-Striker)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Non-Striker */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
            Opening Non-Striker ({battingTeamName})
          </label>
          <select
            value={nonStrikerId}
            onChange={(e) => setNonStrikerId(e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
          >
            <option value="">-- Select Non-Striker --</option>
            {battingSquad.map((p) => (
              <option key={p.player_id} value={p.player_id} disabled={p.player_id === strikerId}>
                {p.full_name || p.player_name} #{p.jersey_number} {p.player_id === strikerId ? '(Selected as Striker)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Opening Bowler */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
            Opening Bowler ({bowlingTeamName})
          </label>
          <select
            value={bowlerId}
            onChange={(e) => setBowlerId(e.target.value)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-accent)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
          >
            <option value="">-- Select Bowler --</option>
            {bowlingSquad.map((b) => (
              <option key={b.player_id} value={b.player_id}>
                {b.full_name || b.player_name} #{b.jersey_number}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={!strikerId || !nonStrikerId || !bowlerId || strikerId === nonStrikerId || isSubmitting}
          style={{ width: '100%', marginTop: '6px' }}
        >
          Begin Innings #{inningsNumber} Scoring
        </Button>
      </form>
    </div>
  );
}
