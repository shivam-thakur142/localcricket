import React, { useState } from 'react';

export function GeneratePlayoffModal({ isOpen, onClose, standings = [], venues = [], onGenerate, isSubmitting }) {
  const [format, setFormat] = useState('PAGE_PLAYOFF');

  if (!isOpen) return null;

  const top4Teams = standings.slice(0, 4);

  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerate({
      format,
      fixtures: [],
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '560px',
          background: '#1e293b',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
            ⚡ Generate Playoff Bracket
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Format Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
              Playoff Format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#f8fafc',
                fontSize: '0.9rem',
              }}
            >
              <option value="PAGE_PLAYOFF">IPL Page Playoff (Q1, Eliminator, Q2, Final — 4 Teams)</option>
              <option value="SEMI_FINALS">Semi-Finals & Final (SF1, SF2, Final — 4 Teams)</option>
            </select>
          </div>

          {/* Seeded Teams Preview */}
          <div
            style={{
              background: '#0f172a',
              borderRadius: '8px',
              padding: '12px 16px',
              border: '1px solid #334155',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
              Seeded from Current Standings (Top 4)
            </span>
            {top4Teams.length < 4 ? (
              <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '8px' }}>
                ⚠️ Warning: Only {top4Teams.length} team(s) found in standings. At least 4 teams are required.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '10px' }}>
                {top4Teams.map((team, idx) => (
                  <div
                    key={team.tournament_team_id}
                    style={{
                      padding: '8px',
                      background: '#1e293b',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        background: '#0284c7',
                        color: '#ffffff',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      #{idx + 1}
                    </span>
                    <strong style={{ color: '#f8fafc' }}>{team.team_name}</strong>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>({team.short_name})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid #475569',
                background: 'transparent',
                color: '#cbd5e1',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || top4Teams.length < 4}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: isSubmitting || top4Teams.length < 4 ? '#475569' : '#0284c7',
                color: '#ffffff',
                fontWeight: 700,
                cursor: isSubmitting || top4Teams.length < 4 ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Generating...' : 'Confirm & Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
