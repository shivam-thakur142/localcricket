import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export function HomePage({ userId, isAuthenticated, onRequireAuth, onSelectTournament, onSelectMatchForSpectator, onOpenStudio }) {
  const [liveMatches, setLiveMatches] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [cityFilter, setCityFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create tournament modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTournName, setNewTournName] = useState('');
  const [newTournShortName, setNewTournShortName] = useState('');
  const [newTournCity, setNewTournCity] = useState('');
  const [newTournBall, setNewTournBall] = useState('TENNIS');
  const [newTournFormat, setNewTournFormat] = useState('T20');
  const [newTournOvers, setNewTournOvers] = useState(20);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadData();
    // Poll live matches every 10 seconds for home ticker
    const interval = setInterval(loadLiveTicker, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [search, statusFilter, cityFilter]);

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([loadLiveTicker(), loadTournaments()]);
    setIsLoading(false);
  };

  const loadLiveTicker = async () => {
    try {
      const res = await api.getLiveMatches();
      setLiveMatches(res.data || []);
    } catch {
      // Non-blocking ticker fail
    }
  };

  const loadTournaments = async () => {
    try {
      const filters = {};
      if (search) filters.search = search;
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (cityFilter) filters.city = cityFilter;

      const res = await api.listTournaments(filters);
      setTournaments(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load tournaments');
    }
  };

  const handleCreateTournament = async (e) => {
    e.preventDefault();
    if (!newTournName || !newTournShortName || !newTournCity) return;
    setIsCreating(true);
    try {
      const payload = {
        name: newTournName,
        short_name: newTournShortName,
        city: newTournCity,
        ball_type: newTournBall,
        format: newTournFormat,
        overs_per_innings: parseInt(newTournOvers),
        status: 'UPCOMING',
      };
      const res = await api.createTournament(payload, userId);
      setShowCreateModal(false);
      setNewTournName('');
      setNewTournShortName('');
      setNewTournCity('');
      await loadTournaments();
      if (onSelectTournament) {
        onSelectTournament(res.data.id);
      }
    } catch (err) {
      alert(err.message || 'Failed to create tournament');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* 1. Global Live Matches Ticker */}
      {liveMatches.length > 0 && (
        <section
          style={{
            background: 'linear-gradient(135deg, #091322 0%, #0f172a 100%)',
            border: '1px solid #0284c7',
            borderRadius: '12px',
            padding: '16px 20px',
            boxShadow: '0 4px 20px rgba(2, 132, 199, 0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
            <h2 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🔴 Live Cricket Action ({liveMatches.length} Matches In Progress)
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
            {liveMatches.map((lm) => {
              const inn = lm.current_innings;
              const overs = inn ? `${Math.floor(inn.total_legal_balls / 6)}.${inn.total_legal_balls % 6}` : '0.0';
              return (
                <div
                  key={lm.id}
                  style={{
                    background: '#1e293b',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    border: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {lm.tournament_name} • Match #{lm.match_number}
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
                      {lm.team_a_short_name} vs {lm.team_b_short_name}
                    </div>
                    {inn && (
                      <div style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 700, marginTop: '2px' }}>
                        {inn.total_runs}/{inn.total_wickets} ({overs} ov)
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onSelectMatchForSpectator && onSelectMatchForSpectator(lm.id)}
                    style={{
                      padding: '6px 14px',
                      background: '#0284c7',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Watch Live 📺
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. Public Tournament Directory Header & Filter Controls */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: '#f8fafc' }}>
              🏟️ Tournament Directory
            </h1>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
              Explore local cricket tournaments, standings, fixtures, and administrative hubs.
            </p>
          </div>

          <button
            onClick={() => isAuthenticated ? setShowCreateModal(true) : onRequireAuth?.()}
            style={{
              padding: '10px 18px',
              background: '#10b981',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ➕ Host New Tournament
          </button>
        </div>

        {/* Filters Bar */}
        <div
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {/* Search */}
          <div style={{ flex: '1 1 240px' }}>
            <input
              type="text"
              placeholder="Search by name or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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

          {/* Status filter buttons */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['ALL', 'ONGOING', 'UPCOMING', 'DRAFT', 'COMPLETED'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: statusFilter === s ? '#0284c7' : '#1e293b',
                  color: statusFilter === s ? '#ffffff' : '#94a3b8',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Tournament Cards Grid */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading tournaments...</div>
        ) : tournaments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: '#0f172a', borderRadius: '10px', color: '#94a3b8' }}>
            No tournaments match your search criteria.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
            {tournaments.map((t) => {
              const statusColors = {
                ONGOING: '#10b981',
                UPCOMING: '#38bdf8',
                DRAFT: '#f59e0b',
                COMPLETED: '#64748b',
                CANCELLED: '#ef4444',
              };
              const badgeColor = statusColors[t.status] || '#64748b';

              return (
                <div
                  key={t.id}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', fontWeight: 800 }}>
                        {t.name}
                      </h3>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          background: `${badgeColor}22`,
                          color: badgeColor,
                          border: `1px solid ${badgeColor}`,
                          textTransform: 'uppercase',
                        }}
                      >
                        {t.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '6px' }}>
                      📍 {t.city} • 🏏 {t.ball_type} ({t.format}) • {t.overs_per_innings} Overs
                    </div>

                    <div style={{ display: 'flex', gap: '16px', marginTop: '16px', background: '#1e293b', padding: '10px 14px', borderRadius: '8px' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Teams</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>{t.teams_count ?? 0}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Fixtures</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>{t.matches_count ?? 0}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Organizer</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', marginTop: '3px' }}>
                          {t.organizer_name || 'Admin'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => onSelectTournament && onSelectTournament(t.id)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: '#0284c7',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      Tournament Hub 📊
                    </button>
                    <button
                      onClick={() => onOpenStudio && onOpenStudio(t.id)}
                      style={{
                        padding: '8px 12px',
                        background: '#334155',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      Studio ⚙️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Host New Tournament Modal */}
      {showCreateModal && (
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
              maxWidth: '480px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem' }}>
                ➕ Host New Tournament
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTournament} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Tournament Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shivaji Park Premier League 2026"
                  value={newTournName}
                  onChange={(e) => setNewTournName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Short Name / Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SPPL26"
                  value={newTournShortName}
                  onChange={(e) => setNewTournShortName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>City / Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mumbai"
                  value={newTournCity}
                  onChange={(e) => setNewTournCity(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Ball Type</label>
                  <select
                    value={newTournBall}
                    onChange={(e) => setNewTournBall(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                  >
                    <option value="TENNIS">Tennis Ball</option>
                    <option value="LEATHER">Leather Ball</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Overs Per Innings</label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={newTournOvers}
                    onChange={(e) => setNewTournOvers(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '8px 16px', background: '#334155', border: 'none', borderRadius: '6px', color: '#f8fafc', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  style={{ padding: '8px 18px', background: '#10b981', border: 'none', borderRadius: '6px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {isCreating ? 'Creating...' : 'Create Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
