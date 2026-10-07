import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { api } from '../../services/api.js';

export function TournamentExportDialog({
  isOpen,
  onClose,
  tournamentId,
  tournamentName,
  userId,
}) {
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingStandings, setIsExportingStandings] = useState(false);
  const [isExportingFixtures, setIsExportingFixtures] = useState(false);
  const [error, setError] = useState(null);

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = async () => {
    setIsExportingJson(true);
    setError(null);
    try {
      const res = await api.exportTournamentArchive(tournamentId, userId);
      const filename = `tournament_archive_${tournamentName ? tournamentName.toLowerCase().replace(/[^a-z0-9]/g, '_') : tournamentId}.json`;
      downloadFile(JSON.stringify(res.data, null, 2), filename, 'application/json');
    } catch (err) {
      setError(err.message || 'Failed to export tournament JSON archive');
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleExportStandingsCsv = async () => {
    setIsExportingStandings(true);
    setError(null);
    try {
      const url = api.exportStandingsCsvUrl(tournamentId);
      const res = await fetch(url, {
        headers: {
          'x-user-id': userId,
        },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${res.status} Export failed`);
      }
      const csvText = await res.text();
      downloadFile(csvText, `standings_${tournamentId}.csv`, 'text/csv');
    } catch (err) {
      setError(err.message || 'Failed to export standings CSV');
    } finally {
      setIsExportingStandings(false);
    }
  };

  const handleExportFixturesCsv = async () => {
    setIsExportingFixtures(true);
    setError(null);
    try {
      const url = api.exportFixturesCsvUrl(tournamentId);
      const res = await fetch(url, {
        headers: {
          'x-user-id': userId,
        },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${res.status} Export failed`);
      }
      const csvText = await res.text();
      downloadFile(csvText, `fixtures_${tournamentId}.csv`, 'text/csv');
    } catch (err) {
      setError(err.message || 'Failed to export fixtures CSV');
    } finally {
      setIsExportingFixtures(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📦 Tournament Archive & Operational Exports"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Download authoritative tournament snapshots and CSV reports. All exports are server-verified and isolated under Repeatable Read transactions.
        </p>

        {error && (
          <div
            style={{
              padding: '10px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              color: '#ef4444',
              fontSize: '0.85rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Card 1: Full JSON Archive */}
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-accent)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Full Tournament Archive (JSON)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Complete snapshot including metadata, teams, rosters, innings summaries, officials, standings, awards, and operations audit log.
              </div>
            </div>
            <button
              onClick={handleExportJson}
              disabled={isExportingJson}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: 'none',
                background: '#0284c7',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginLeft: '12px',
              }}
            >
              {isExportingJson ? 'Generating Snapshot...' : '⬇️ Download JSON'}
            </button>
          </div>

          {/* Card 2: Standings CSV */}
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-accent)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Standings Table (CSV)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                RFC 4180 compliant CSV of tournament rankings, wins, points, and Net Run Rate (NRR).
              </div>
            </div>
            <button
              onClick={handleExportStandingsCsv}
              disabled={isExportingStandings}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #10b981',
                background: 'transparent',
                color: '#10b981',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginLeft: '12px',
              }}
            >
              {isExportingStandings ? 'Exporting...' : '📄 Download Standings CSV'}
            </button>
          </div>

          {/* Card 3: Fixtures CSV */}
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-accent)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Fixtures & Official Assignments (CSV)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Complete schedule including match numbers, stages, venues, results, and assigned umpires.
              </div>
            </div>
            <button
              onClick={handleExportFixturesCsv}
              disabled={isExportingFixtures}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #38bdf8',
                background: 'transparent',
                color: '#38bdf8',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginLeft: '12px',
              }}
            >
              {isExportingFixtures ? 'Exporting...' : '📄 Download Fixtures CSV'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
