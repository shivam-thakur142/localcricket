import React, { useState } from 'react';
import { Button } from '../common/Button.jsx';

export function SquadSelector({
  teamName,
  tournamentTeamId,
  squadData, // { full_roster: [...], playing_xi: [...] }
  onSubmitSquad,
  isSubmitting = false,
}) {
  const fullRoster = squadData?.full_roster || [];
  const initialPlayingXI = (squadData?.playing_xi || []).map((p) => p.player_id);

  const [selectedPlayerIds, setSelectedPlayerIds] = useState(
    initialPlayingXI.length > 0 ? initialPlayingXI : fullRoster.slice(0, 11).map((p) => p.player_id)
  );
  const [captainId, setCaptainId] = useState(
    squadData?.playing_xi?.find((p) => p.is_captain)?.player_id || selectedPlayerIds[0] || ''
  );
  const [wicketKeeperId, setWicketKeeperId] = useState(
    squadData?.playing_xi?.find((p) => p.is_wicket_keeper)?.player_id || selectedPlayerIds[1] || ''
  );

  const togglePlayer = (id) => {
    if (selectedPlayerIds.includes(id)) {
      setSelectedPlayerIds(selectedPlayerIds.filter((pId) => pId !== id));
      if (captainId === id) setCaptainId('');
      if (wicketKeeperId === id) setWicketKeeperId('');
    } else {
      if (selectedPlayerIds.length < 11) {
        setSelectedPlayerIds([...selectedPlayerIds, id]);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedPlayerIds.length !== 11) {
      alert(`Playing XI must contain exactly 11 players. Currently selected: ${selectedPlayerIds.length}`);
      return;
    }
    if (!captainId) {
      alert('Please nominate a Captain for the team.');
      return;
    }
    if (!wicketKeeperId) {
      alert('Please nominate a Wicket Keeper for the team.');
      return;
    }

    onSubmitSquad({
      tournamentTeamId,
      playerIds: selectedPlayerIds,
      captainId,
      wicketKeeperId,
    });
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8' }}>
          {teamName} — Confirm Playing XI
        </h3>
        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: selectedPlayerIds.length === 11 ? '#10b981' : '#f59e0b' }}>
          {selectedPlayerIds.length} / 11 Selected
        </span>
      </div>

      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Select 11 players from the registered tournament roster of {fullRoster.length} players.
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', marginBottom: '16px' }}>
          {fullRoster.map((player) => {
            const isSelected = selectedPlayerIds.includes(player.player_id);
            return (
              <div
                key={player.player_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: isSelected ? '1px solid #0284c7' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(2, 132, 199, 0.15)' : 'var(--bg-accent)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePlayer(player.player_id)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                    {player.full_name} <span style={{ color: 'var(--text-muted)' }}>#{player.jersey_number}</span>
                  </span>
                </label>

                {isSelected && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setCaptainId(player.player_id)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: captainId === player.player_id ? '#f59e0b' : 'var(--border-color)',
                        color: captainId === player.player_id ? '#1e293b' : 'var(--text-secondary)',
                      }}
                    >
                      (C)
                    </button>
                    <button
                      type="button"
                      onClick={() => setWicketKeeperId(player.player_id)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: wicketKeeperId === player.player_id ? '#10b981' : 'var(--border-color)',
                        color: wicketKeeperId === player.player_id ? '#ffffff' : 'var(--text-secondary)',
                      }}
                    >
                      (WK)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={selectedPlayerIds.length !== 11 || isSubmitting}
          style={{ width: '100%' }}
        >
          Confirm {teamName} Squad ({selectedPlayerIds.length}/11)
        </Button>
      </form>
    </div>
  );
}
