import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import { Toast } from '../components/common/Toast.jsx';

export function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState('OVERVIEW'); // 'OVERVIEW' | 'LIVE_MONITOR' | 'TOURNAMENTS' | 'USERS' | 'PLAYER_MERGE' | 'TEAMS_VENUES' | 'AUDIT_LOGS'
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Overview State
  const [overview, setOverview] = useState(null);

  // Live Matches State
  const [liveMatches, setLiveMatches] = useState([]);
  const [sseConnected, setSseConnected] = useState(false);

  // Tournaments State
  const [tournaments, setTournaments] = useState([]);
  const [tournamentSearch, setTournamentSearch] = useState('');
  const [tournamentStatusFilter, setTournamentStatusFilter] = useState('');
  const [activeTournamentModal, setActiveTournamentModal] = useState(null); // { type: 'FREEZE' | 'TRANSFER', tournament }
  const [modalReason, setModalReason] = useState('');
  const [modalNewOwner, setModalNewOwner] = useState('');

  // Users State
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [activeUserModal, setActiveUserModal] = useState(null); // { type: 'SUSPEND' | 'ROLE', targetUser, newRole, suspendState }

  // Player Merge Wizard State
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [isMergeConfirmOpen, setIsMergeConfirmOpen] = useState(false);
  const [mergeResult, setMergeResult] = useState(null);

  // Teams & Venues State
  const [teams, setTeams] = useState([]);
  const [blackouts, setBlackouts] = useState([]);
  const [activeTeamVerifyModal, setActiveTeamVerifyModal] = useState(null); // { team, newVerifiedState }
  const [newBlackoutVenueId, setNewBlackoutVenueId] = useState('');
  const [newBlackoutStart, setNewBlackoutStart] = useState('');
  const [newBlackoutEnd, setNewBlackoutEnd] = useState('');
  const [newBlackoutReason, setNewBlackoutReason] = useState('');
  const [activeDeleteBlackoutModal, setActiveDeleteBlackoutModal] = useState(null); // blackoutId

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditEntityFilter, setAuditEntityFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  const addToast = (title, message, type = 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  // ----------------------------------------------------
  // DATA FETCHING ROUTINES
  // ----------------------------------------------------
  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getPlatformOverview();
      setOverview(res.data);
    } catch (err) {
      addToast('Overview Error', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLiveMatches = useCallback(async () => {
    try {
      const res = await api.getAdminLiveMatches();
      setLiveMatches(res.data || []);
    } catch (err) {
      addToast('Live Monitor Error', err.message);
    }
  }, []);

  const fetchTournaments = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (tournamentSearch) params.search = tournamentSearch;
      if (tournamentStatusFilter) params.status = tournamentStatusFilter;
      const res = await api.listAdminTournaments(params);
      setTournaments(res.data?.tournaments || []);
    } catch (err) {
      addToast('Tournaments Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentSearch, tournamentStatusFilter]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (userSearch) params.search = userSearch;
      if (userRoleFilter) params.role = userRoleFilter;
      const res = await api.listAdminUsers(params);
      setUsers(res.data?.users || []);
    } catch (err) {
      addToast('Users Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [userSearch, userRoleFilter]);

  const fetchTeamsAndBlackouts = useCallback(async () => {
    try {
      setLoading(true);
      const [teamsRes, blackoutsRes] = await Promise.all([
        api.listAdminTeams(),
        api.listVenueBlackouts(),
      ]);
      setTeams(teamsRes.data?.teams || []);
      setBlackouts(blackoutsRes.data?.blackouts || []);
    } catch (err) {
      addToast('Teams/Blackouts Error', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (auditEntityFilter) params.targetEntityType = auditEntityFilter;
      if (auditActionFilter) params.action = auditActionFilter;
      const res = await api.listAdminAuditLogs(params);
      setAuditLogs(res.data?.logs || []);
    } catch (err) {
      addToast('Audit Logs Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [auditEntityFilter, auditActionFilter]);

  // Tab switch effect
  useEffect(() => {
    if (activeTab === 'OVERVIEW') fetchOverview();
    if (activeTab === 'LIVE_MONITOR') fetchLiveMatches();
    if (activeTab === 'TOURNAMENTS') fetchTournaments();
    if (activeTab === 'USERS') fetchUsers();
    if (activeTab === 'TEAMS_VENUES') fetchTeamsAndBlackouts();
    if (activeTab === 'AUDIT_LOGS') fetchAuditLogs();
  }, [activeTab, fetchOverview, fetchLiveMatches, fetchTournaments, fetchUsers, fetchTeamsAndBlackouts, fetchAuditLogs]);

  // SSE Stream for Live Matches
  useEffect(() => {
    if (activeTab !== 'LIVE_MONITOR') return;

    let eventSource = null;
    try {
      eventSource = new EventSource('/api/v1/admin/stream');
      eventSource.onopen = () => setSseConnected(true);
      eventSource.addEventListener('admin_live_update', (e) => {
        try {
          const update = JSON.parse(e.data);
          setLiveMatches((prev) => {
            const index = prev.findIndex((m) => m.id === update.matchId);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = { ...updated[index], ...update };
              return updated;
            }
            return [update, ...prev];
          });
        } catch {
          // ignore parsing error
        }
      });
      eventSource.onerror = () => {
        setSseConnected(false);
      };
    } catch {
      setSseConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [activeTab]);

  // ----------------------------------------------------
  // ACTION HANDLERS
  // ----------------------------------------------------
  const handleFreezeTournament = async () => {
    if (!activeTournamentModal?.tournament || modalReason.trim().length < 5) {
      addToast('Validation', 'A reason of at least 5 characters is required');
      return;
    }
    const t = activeTournamentModal.tournament;
    const targetState = !t.is_frozen;
    try {
      await api.freezeTournament(t.id, { isFrozen: targetState, reason: modalReason.trim() });
      addToast('Success', `Tournament ${targetState ? 'frozen' : 'unfrozen'} successfully`, 'success');
      setActiveTournamentModal(null);
      setModalReason('');
      fetchTournaments();
    } catch (err) {
      addToast('Freeze Error', err.message);
    }
  };

  const handleTransferOwnership = async () => {
    if (!activeTournamentModal?.tournament || !modalNewOwner.trim() || modalReason.trim().length < 5) {
      addToast('Validation', 'New Owner User ID and reason (>= 5 chars) are required');
      return;
    }
    const t = activeTournamentModal.tournament;
    try {
      await api.transferTournamentOwnership(t.id, {
        newOwnerUserId: modalNewOwner.trim(),
        reason: modalReason.trim(),
      });
      addToast('Success', 'Ownership transferred successfully', 'success');
      setActiveTournamentModal(null);
      setModalReason('');
      setModalNewOwner('');
      fetchTournaments();
    } catch (err) {
      addToast('Transfer Error', err.message);
    }
  };

  const handleUnlockUser = async (userId) => {
    try {
      await api.unlockUserAccount(userId, { reason: 'Administrative manual unlock' });
      addToast('Success', 'User account unlocked successfully', 'success');
      fetchUsers();
    } catch (err) {
      addToast('Unlock Error', err.message);
    }
  };

  const handleUpdateUserStatus = async () => {
    if (!activeUserModal?.targetUser || modalReason.trim().length < 5) {
      addToast('Validation', 'Reason of at least 5 characters is required');
      return;
    }
    const u = activeUserModal.targetUser;
    const targetSuspended = activeUserModal.suspendState;
    try {
      await api.updateUserStatus(u.id, { isSuspended: targetSuspended, reason: modalReason.trim() });
      addToast('Success', `User ${targetSuspended ? 'suspended' : 'reactivated'} successfully`, 'success');
      setActiveUserModal(null);
      setModalReason('');
      fetchUsers();
    } catch (err) {
      addToast('Status Update Error', err.message);
    }
  };

  const handleUpdateUserRole = async () => {
    if (!activeUserModal?.targetUser || modalReason.trim().length < 5) {
      addToast('Validation', 'Reason of at least 5 characters is required');
      return;
    }
    const u = activeUserModal.targetUser;
    const targetRole = activeUserModal.newRole;
    try {
      await api.updateUserRole(u.id, { globalRole: targetRole, reason: modalReason.trim() });
      addToast('Success', `User role updated to ${targetRole}`, 'success');
      setActiveUserModal(null);
      setModalReason('');
      fetchUsers();
    } catch (err) {
      addToast('Role Update Error', err.message);
    }
  };

  const handleExecuteMerge = async () => {
    if (!mergeSourceId.trim() || !mergeTargetId.trim() || mergeReason.trim().length < 5) {
      addToast('Validation', 'Source ID, Target ID, and reason (>= 5 chars) are required');
      return;
    }
    try {
      const res = await api.mergePlayers({
        sourcePlayerId: mergeSourceId.trim(),
        targetPlayerId: mergeTargetId.trim(),
        reason: mergeReason.trim(),
      });
      setMergeResult(res.data?.mergeSummary || res.data);
      setIsMergeConfirmOpen(false);
      setMergeSourceId('');
      setMergeTargetId('');
      setMergeReason('');
      addToast('Merge Complete', 'Player deduplication completed successfully', 'success');
    } catch (err) {
      addToast('Merge Error', err.message);
    }
  };

  const handleToggleTeamVerification = async () => {
    if (!activeTeamVerifyModal?.team || modalReason.trim().length < 5) {
      addToast('Validation', 'Reason of at least 5 characters is required');
      return;
    }
    const t = activeTeamVerifyModal.team;
    const targetVerified = activeTeamVerifyModal.newVerifiedState;
    try {
      await api.toggleTeamVerification(t.id, { isVerified: targetVerified, reason: modalReason.trim() });
      addToast('Success', `Team ${targetVerified ? 'verified' : 'unverified'} successfully`, 'success');
      setActiveTeamVerifyModal(null);
      setModalReason('');
      fetchTeamsAndBlackouts();
    } catch (err) {
      addToast('Team Verification Error', err.message);
    }
  };

  const handleCreateBlackout = async (e) => {
    e.preventDefault();
    if (!newBlackoutVenueId || !newBlackoutStart || !newBlackoutEnd || newBlackoutReason.trim().length < 5) {
      addToast('Validation', 'All fields and reason (>= 5 chars) are required');
      return;
    }
    try {
      await api.createVenueBlackout({
        venueId: newBlackoutVenueId,
        startTime: new Date(newBlackoutStart).toISOString(),
        endTime: new Date(newBlackoutEnd).toISOString(),
        reason: newBlackoutReason.trim(),
      });
      addToast('Success', 'Venue blackout window scheduled successfully', 'success');
      setNewBlackoutVenueId('');
      setNewBlackoutStart('');
      setNewBlackoutEnd('');
      setNewBlackoutReason('');
      fetchTeamsAndBlackouts();
    } catch (err) {
      addToast('Blackout Creation Error', err.message);
    }
  };

  const handleDeleteBlackout = async () => {
    if (!activeDeleteBlackoutModal || modalReason.trim().length < 5) {
      addToast('Validation', 'Reason of at least 5 characters is required');
      return;
    }
    try {
      await api.deleteVenueBlackout(activeDeleteBlackoutModal, { reason: modalReason.trim() });
      addToast('Success', 'Blackout window removed successfully', 'success');
      setActiveDeleteBlackoutModal(null);
      setModalReason('');
      fetchTeamsAndBlackouts();
    } catch (err) {
      addToast('Blackout Deletion Error', err.message);
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 16px' }}>
      <Toast toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #450a0a 0%, #1e1b4b 100%)',
          border: '1px solid #dc2626',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.8rem' }}>⚡</span>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc' }}>
              Super Admin Console
            </h1>
          </div>
          <p style={{ margin: '6px 0 0 0', color: '#fca5a5', fontSize: '0.9rem' }}>
            Platform-wide governance, cross-tournament live telemetry, deduplication engine, and immutable audit logs
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              background: overview?.diagnostics?.dbStatus === 'HEALTHY' ? '#064e3b' : '#7f1d1d',
              border: `1px solid ${overview?.diagnostics?.dbStatus === 'HEALTHY' ? '#10b981' : '#ef4444'}`,
              color: '#f8fafc',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}
          >
            DB: {overview?.diagnostics?.dbStatus || 'CHECKING'} ({overview?.diagnostics?.latencyMs || 0}ms)
          </span>
          <button
            onClick={() => {
              if (activeTab === 'OVERVIEW') fetchOverview();
              if (activeTab === 'LIVE_MONITOR') fetchLiveMatches();
              if (activeTab === 'TOURNAMENTS') fetchTournaments();
              if (activeTab === 'USERS') fetchUsers();
              if (activeTab === 'TEAMS_VENUES') fetchTeamsAndBlackouts();
              if (activeTab === 'AUDIT_LOGS') fetchAuditLogs();
            }}
            style={{
              background: '#374151',
              border: 'none',
              color: '#f9fafb',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '12px',
          marginBottom: '24px',
          overflowX: 'auto',
        }}
      >
        {[
          { key: 'OVERVIEW', label: '📊 Overview' },
          { key: 'LIVE_MONITOR', label: '📡 Live Monitor' },
          { key: 'TOURNAMENTS', label: '🏆 Tournaments' },
          { key: 'USERS', label: '👥 User Moderation' },
          { key: 'PLAYER_MERGE', label: '🧬 Player Deduplication' },
          { key: 'TEAMS_VENUES', label: '🛡️ Teams & Venues' },
          { key: 'AUDIT_LOGS', label: '📜 Audit Trail' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: activeTab === tab.key ? '#dc2626' : 'var(--bg-accent)',
              color: activeTab === tab.key ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
          Loading admin data...
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 1. OVERVIEW TAB */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'OVERVIEW' && overview && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {[
              { label: 'Total Users', value: overview.stats.totalUsers, color: '#3b82f6', icon: '👥' },
              { label: 'Active Sessions', value: overview.stats.activeSessions, color: '#10b981', icon: '🔑' },
              { label: 'Tournaments', value: overview.stats.totalTournaments, color: '#8b5cf6', icon: '🏆' },
              { label: 'Total Matches', value: overview.stats.totalMatches, color: '#f59e0b', icon: '🏏' },
              { label: 'Live Matches', value: overview.stats.liveMatchesCount, color: '#ef4444', icon: '🔴' },
              { label: 'Deliveries Bowled', value: overview.stats.totalBallsBowled, color: '#06b6d4', icon: '🎯' },
              { label: 'Locked Accounts', value: overview.stats.lockedAccounts, color: '#f97316', icon: '🔒' },
              { label: 'Suspended Users', value: overview.stats.suspendedUsers, color: '#e11d48', icon: '⛔' },
              { label: 'Super Admins', value: overview.stats.superAdminsCount, color: '#ec4899', icon: '⚡' },
            ].map((metric) => (
              <div
                key={metric.label}
                style={{
                  background: 'var(--bg-accent)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                }}
              >
                <span style={{ fontSize: '2rem' }}>{metric.icon}</span>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                    {metric.label}
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: metric.color }}>
                    {metric.value}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div
              style={{
                background: 'var(--bg-accent)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '20px',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#f8fafc' }}>
                🏆 Tournaments by Status
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(overview.stats.tournamentsByStatus || {}).map(([st, cnt]) => (
                  <div
                    key={st}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#0f172a',
                      borderRadius: '6px',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#cbd5e1' }}>{st}</span>
                    <span style={{ fontWeight: 700, color: '#38bdf8' }}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-accent)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '20px',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#f8fafc' }}>
                🏏 Matches by Status
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(overview.stats.matchesByStatus || {}).map(([st, cnt]) => (
                  <div
                    key={st}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#0f172a',
                      borderRadius: '6px',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#cbd5e1' }}>{st}</span>
                    <span style={{ fontWeight: 700, color: '#f59e0b' }}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. LIVE MONITOR TAB */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'LIVE_MONITOR' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc' }}>
              📡 Cross-Tournament Live Matches
            </h2>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '12px',
                background: sseConnected ? '#064e3b' : '#7f1d1d',
                color: '#f8fafc',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {sseConnected ? '● SSE Stream Connected' : '○ Polling Fallback'}
            </span>
          </div>

          {liveMatches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
              No matches currently in progress across the platform.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
              {liveMatches.map((m) => (
                <div
                  key={m.id}
                  style={{
                    background: 'var(--bg-accent)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>
                      {m.tournament_name || 'Tournament'}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: '#dc2626',
                        color: '#ffffff',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                      }}
                    >
                      LIVE {m.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
                    {m.team_a_name} vs {m.team_b_name}
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    Match #{m.match_number} • {m.stage}
                  </div>

                  <div
                    style={{
                      background: '#090d16',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                      Score: <strong style={{ color: '#38bdf8' }}>{m.current_score || '0/0'}</strong>
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                      Overs: <strong>{m.overs_summary || '0.0'}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. TOURNAMENTS TAB */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'TOURNAMENTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search tournaments..."
              value={tournamentSearch}
              onChange={(e) => setTournamentSearch(e.target.value)}
              style={{
                flex: 1,
                minWidth: '220px',
                padding: '8px 12px',
                background: '#0f172a',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
            <select
              value={tournamentStatusFilter}
              onChange={(e) => setTournamentStatusFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                background: '#0f172a',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="UPCOMING">UPCOMING</option>
              <option value="ONGOING">ONGOING</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: '#94a3b8', fontSize: '0.8rem' }}>
                  <th style={{ padding: '12px' }}>Tournament</th>
                  <th style={{ padding: '12px' }}>City</th>
                  <th style={{ padding: '12px' }}>Status</th>
                  <th style={{ padding: '12px' }}>Freeze State</th>
                  <th style={{ padding: '12px' }}>Owner</th>
                  <th style={{ padding: '12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#f8fafc' }}>
                      {t.name}
                    </td>
                    <td style={{ padding: '12px', color: '#cbd5e1' }}>{t.city || '—'}</td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: '#1e293b',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {t.is_frozen ? (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: '#7f1d1d',
                            color: '#fca5a5',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          ❄️ FROZEN
                        </span>
                      ) : (
                        <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 700 }}>
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
                      {t.created_by_user_id?.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setActiveTournamentModal({ type: 'FREEZE', tournament: t });
                            setModalReason('');
                          }}
                          style={{
                            background: t.is_frozen ? '#065f46' : '#7f1d1d',
                            color: '#ffffff',
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {t.is_frozen ? 'Unfreeze' : 'Freeze'}
                        </button>
                        <button
                          onClick={() => {
                            setActiveTournamentModal({ type: 'TRANSFER', tournament: t });
                            setModalReason('');
                            setModalNewOwner('');
                          }}
                          style={{
                            background: '#1e293b',
                            color: '#38bdf8',
                            border: '1px solid #0284c7',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Transfer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 4. USERS TAB */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'USERS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search users by name, email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              style={{
                flex: 1,
                minWidth: '220px',
                padding: '8px 12px',
                background: '#0f172a',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            />
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                background: '#0f172a',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            >
              <option value="">All Roles</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              <option value="USER">USER</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: '#94a3b8', fontSize: '0.8rem' }}>
                  <th style={{ padding: '12px' }}>User</th>
                  <th style={{ padding: '12px' }}>Email</th>
                  <th style={{ padding: '12px' }}>Role</th>
                  <th style={{ padding: '12px' }}>Status</th>
                  <th style={{ padding: '12px' }}>Lockout</th>
                  <th style={{ padding: '12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#f8fafc' }}>
                      {u.full_name}
                    </td>
                    <td style={{ padding: '12px', color: '#cbd5e1' }}>{u.email}</td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: u.global_role === 'SUPER_ADMIN' ? '#450a0a' : '#1e293b',
                          color: u.global_role === 'SUPER_ADMIN' ? '#f87171' : '#cbd5e1',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        {u.global_role}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {u.is_suspended ? (
                        <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.75rem' }}>
                          ⛔ SUSPENDED
                        </span>
                      ) : (
                        <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.75rem' }}>
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {u.is_locked ? (
                        <span style={{ color: '#f97316', fontWeight: 700, fontSize: '0.75rem' }}>
                          🔒 LOCKED
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>CLEAR</span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {u.is_locked && (
                          <button
                            onClick={() => handleUnlockUser(u.id)}
                            style={{
                              background: '#1e293b',
                              color: '#f97316',
                              border: '1px solid #ea580c',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Unlock
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setActiveUserModal({
                              type: 'SUSPEND',
                              targetUser: u,
                              suspendState: !u.is_suspended,
                            });
                            setModalReason('');
                          }}
                          style={{
                            background: u.is_suspended ? '#065f46' : '#7f1d1d',
                            color: '#ffffff',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          {u.is_suspended ? 'Reactivate' : 'Suspend'}
                        </button>
                        <button
                          onClick={() => {
                            setActiveUserModal({
                              type: 'ROLE',
                              targetUser: u,
                              newRole: u.global_role === 'SUPER_ADMIN' ? 'USER' : 'SUPER_ADMIN',
                            });
                            setModalReason('');
                          }}
                          style={{
                            background: '#1e293b',
                            color: '#94a3b8',
                            border: '1px solid var(--border-color)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          {u.global_role === 'SUPER_ADMIN' ? 'Demote' : 'Promote'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. PLAYER DEDUPLICATION WIZARD */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'PLAYER_MERGE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', margin: '0 auto' }}>
          <div
            style={{
              background: 'var(--bg-accent)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '24px',
            }}
          >
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', color: '#f8fafc' }}>
              🧬 Player Deduplication & Merge Engine
            </h2>
            <p style={{ margin: '0 0 20px 0', color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Atomically remap all deliveries, match rosters, player statistics, and tournament awards from a duplicate player profile to an authoritative profile, then delete the duplicate.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                  Source Player UUID (To be MERGED and DELETED):
                </label>
                <input
                  type="text"
                  placeholder="e.g. 90000000-0000-0000-0000-000000000001"
                  value={mergeSourceId}
                  onChange={(e) => setMergeSourceId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                  Target Player UUID (Authoritative Survivor):
                </label>
                <input
                  type="text"
                  placeholder="e.g. 90000000-0000-0000-0000-000000000002"
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                  Reason (Mandatory, minimum 5 characters):
                </label>
                <textarea
                  rows={3}
                  placeholder="Administrative justification for merging these profiles..."
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                  }}
                />
              </div>

              <button
                onClick={() => {
                  if (!mergeSourceId.trim() || !mergeTargetId.trim() || mergeReason.trim().length < 5) {
                    addToast('Validation', 'Please provide Source UUID, Target UUID, and reason (>= 5 chars)');
                    return;
                  }
                  setIsMergeConfirmOpen(true);
                }}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginTop: '8px',
                }}
              >
                Review & Execute Merge
              </button>
            </div>
          </div>

          {mergeResult && (
            <div
              style={{
                background: '#064e3b',
                border: '1px solid #10b981',
                borderRadius: '10px',
                padding: '20px',
              }}
            >
              <h3 style={{ margin: '0 0 12px 0', color: '#6ee7b7' }}>
                ✅ Deduplication Successful
              </h3>
              <div style={{ fontSize: '0.85rem', color: '#d1fae5', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div><strong>Survivor Player ID:</strong> {mergeResult.targetPlayerId}</div>
                <div><strong>Rosters Consolidated/Remapped:</strong> {mergeResult.rostersRemapped}</div>
                <div><strong>Deliveries Reassigned:</strong> {mergeResult.deliveriesRemapped}</div>
                <div><strong>Awards/POTM Reassigned:</strong> {mergeResult.awardsRemapped}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 6. TEAMS & VENUES TAB */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'TEAMS_VENUES' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Global Teams Verification */}
          <div
            style={{
              background: 'var(--bg-accent)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '20px',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
              🛡️ Team Identity Verification
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
              {teams.map((team) => (
                <div
                  key={team.id}
                  style={{
                    background: '#0f172a',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#f8fafc' }}>{team.name} ({team.short_name})</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{team.city || 'No city'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {team.is_verified ? (
                      <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.75rem' }}>✅ VERIFIED</span>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '0.75rem' }}>UNVERIFIED</span>
                    )}
                    <button
                      onClick={() => {
                        setActiveTeamVerifyModal({ team, newVerifiedState: !team.is_verified });
                        setModalReason('');
                      }}
                      style={{
                        background: team.is_verified ? '#7f1d1d' : '#065f46',
                        color: '#ffffff',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {team.is_verified ? 'Revoke' : 'Verify'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Venue Blackouts Manager */}
          <div
            style={{
              background: 'var(--bg-accent)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>
              ⛔ Venue Blackout Schedules
            </h3>

            {/* Schedule Form */}
            <form onSubmit={handleCreateBlackout} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                placeholder="Venue UUID"
                value={newBlackoutVenueId}
                onChange={(e) => setNewBlackoutVenueId(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: '#0f172a',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="datetime-local"
                  value={newBlackoutStart}
                  onChange={(e) => setNewBlackoutStart(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: '#0f172a',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                  }}
                />
                <input
                  type="datetime-local"
                  value={newBlackoutEnd}
                  onChange={(e) => setNewBlackoutEnd(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: '#0f172a',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                  }}
                />
              </div>
              <input
                type="text"
                placeholder="Reason (e.g. Ground maintenance, Pitch relaying)"
                value={newBlackoutReason}
                onChange={(e) => setNewBlackoutReason(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: '#0f172a',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                }}
              />
              <button
                type="submit"
                style={{
                  background: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Schedule Blackout
              </button>
            </form>

            {/* Existing Blackouts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
              {blackouts.map((b) => (
                <div
                  key={b.id}
                  style={{
                    background: '#0f172a',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 700, color: '#f8fafc' }}>{b.venue_name || b.venue_id}</div>
                    <div style={{ color: '#94a3b8' }}>
                      {new Date(b.start_time).toLocaleString()} – {new Date(b.end_time).toLocaleString()}
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>Reason: {b.reason}</div>
                  </div>
                  <button
                    onClick={() => {
                      setActiveDeleteBlackoutModal(b.id);
                      setModalReason('');
                    }}
                    style={{
                      background: '#7f1d1d',
                      color: '#ffffff',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 7. AUDIT TRAIL TAB */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'AUDIT_LOGS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <select
              value={auditEntityFilter}
              onChange={(e) => setAuditEntityFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                background: '#0f172a',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#f8fafc',
              }}
            >
              <option value="">All Entity Types</option>
              <option value="TOURNAMENT">TOURNAMENT</option>
              <option value="USER">USER</option>
              <option value="PLAYER">PLAYER</option>
              <option value="VENUE_BLACKOUT">VENUE_BLACKOUT</option>
              <option value="TEAM">TEAM</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: '#94a3b8', fontSize: '0.8rem' }}>
                  <th style={{ padding: '12px' }}>Timestamp</th>
                  <th style={{ padding: '12px' }}>Action</th>
                  <th style={{ padding: '12px' }}>Entity</th>
                  <th style={{ padding: '12px' }}>Target ID</th>
                  <th style={{ padding: '12px' }}>Admin</th>
                  <th style={{ padding: '12px' }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                    <td style={{ padding: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 700, color: '#38bdf8' }}>
                      {log.action}
                    </td>
                    <td style={{ padding: '12px', color: '#cbd5e1' }}>{log.target_entity_type}</td>
                    <td style={{ padding: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      {log.target_entity_id?.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '12px', color: '#cbd5e1' }}>
                      {log.admin_name || log.admin_user_id?.slice(0, 8)}
                    </td>
                    <td style={{ padding: '12px', color: '#f8fafc' }}>{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODALS */}
      {/* ---------------------------------------------------- */}

      {/* Tournament Modal */}
      {activeTournamentModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
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
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, color: '#f8fafc' }}>
              {activeTournamentModal.type === 'FREEZE'
                ? activeTournamentModal.tournament.is_frozen
                  ? 'Unfreeze Tournament'
                  : 'Freeze Tournament'
                : 'Transfer Tournament Ownership'}
            </h3>

            {activeTournamentModal.type === 'TRANSFER' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                  New Owner User ID:
                </label>
                <input
                  type="text"
                  placeholder="UUID of registered user"
                  value={modalNewOwner}
                  onChange={(e) => setModalNewOwner(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#1e293b',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                Audit Reason (Mandatory, minimum 5 characters):
              </label>
              <textarea
                rows={3}
                placeholder="Reason for administrative action..."
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#1e293b',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setActiveTournamentModal(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={
                  activeTournamentModal.type === 'FREEZE' ? handleFreezeTournament : handleTransferOwnership
                }
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      {activeUserModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
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
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, color: '#f8fafc' }}>
              {activeUserModal.type === 'SUSPEND'
                ? activeUserModal.suspendState
                  ? 'Suspend User Account'
                  : 'Reactivate User Account'
                : `Update Role to ${activeUserModal.newRole}`}
            </h3>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                Audit Reason (Mandatory, minimum 5 characters):
              </label>
              <textarea
                rows={3}
                placeholder="Reason for moderation action..."
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#1e293b',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setActiveUserModal(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={activeUserModal.type === 'SUSPEND' ? handleUpdateUserStatus : handleUpdateUserRole}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Verify Modal */}
      {activeTeamVerifyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
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
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, color: '#f8fafc' }}>
              {activeTeamVerifyModal.newVerifiedState ? 'Verify Team Identity' : 'Revoke Team Verification'}
            </h3>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                Audit Reason (Mandatory, minimum 5 characters):
              </label>
              <textarea
                rows={3}
                placeholder="Reason for verification change..."
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#1e293b',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setActiveTeamVerifyModal(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleToggleTeamVerification}
                style={{
                  background: activeTeamVerifyModal.newVerifiedState ? '#059669' : '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Blackout Modal */}
      {activeDeleteBlackoutModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
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
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, color: '#f8fafc' }}>
              Remove Venue Blackout Window
            </h3>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                Audit Reason (Mandatory, minimum 5 characters):
              </label>
              <textarea
                rows={3}
                placeholder="Reason for early cancellation of blackout..."
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#1e293b',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setActiveDeleteBlackoutModal(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBlackout}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Delete Blackout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Confirmation Modal */}
      {isMergeConfirmOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
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
              border: '2px solid #ef4444',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '520px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, color: '#f87171' }}>
              ⚠️ Confirm Permanent Player Deduplication
            </h3>

            <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.5 }}>
              This action is <strong>permanent and irreversible</strong>. All deliveries, match player registrations, team rosters, and award links will be migrated to the target player, and the source player record will be permanently deleted.
            </p>

            <div
              style={{
                background: '#1e293b',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div><strong>Source (To Delete):</strong> {mergeSourceId}</div>
              <div><strong>Target (Survivor):</strong> {mergeTargetId}</div>
              <div><strong>Reason:</strong> {mergeReason}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setIsMergeConfirmOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteMerge}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Execute Deduplication
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
