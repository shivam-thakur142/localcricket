import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { TournamentSettingsForm } from '../components/admin/TournamentSettingsForm.jsx';
import { AssignScorerModal } from '../components/admin/AssignScorerModal.jsx';
import { ResolveMatchModal } from '../components/admin/ResolveMatchModal.jsx';
import { CreateFixtureModal } from '../components/tournament/CreateFixtureModal.jsx';
import { PlayoffAdminTab } from '../components/admin/PlayoffAdminTab.jsx';
import { GeneratePlayoffModal } from '../components/tournament/GeneratePlayoffModal.jsx';
import { ScheduleMatrixView } from '../components/admin/ScheduleMatrixView.jsx';
import { OfficialsAssignmentModal } from '../components/admin/OfficialsAssignmentModal.jsx';
import { SquadVerificationBadge } from '../components/tournament/SquadVerificationBadge.jsx';
import { TournamentExportDialog } from '../components/tournament/TournamentExportDialog.jsx';
import { InviteMembersModal } from '../components/tournament/InviteMembersModal.jsx';

export function OrganizerStudioPage({ tournamentId, userId, onBackToHub }) {
  const [tournament, setTournament] = useState(null);
  const [activeTab, setActiveTab] = useState('SETTINGS'); // 'SETTINGS' | 'VENUES' | 'TEAMS' | 'FIXTURES' | 'PLAYOFFS'
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Venues state
  const [venues, setVenues] = useState([]);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueGround, setNewVenueGround] = useState('');
  const [newVenueCity, setNewVenueCity] = useState('');
  const [isAddingVenue, setIsAddingVenue] = useState(false);

  // Teams & Squads state
  const [teams, setTeams] = useState([]);
  const [globalTeams, setGlobalTeams] = useState([]);
  const [selectedGlobalTeamId, setSelectedGlobalTeamId] = useState('');
  const [groupName, setGroupName] = useState('General');
  const [isRegisteringTeam, setIsRegisteringTeam] = useState(false);

  // Fixtures & Match Ops state
  const [matches, setMatches] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [activeAssignMatch, setActiveAssignMatch] = useState(null);
  const [activeResolveMatch, setActiveResolveMatch] = useState(null);
  const [activeAuditMatch, setActiveAuditMatch] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // Playoffs state
  const [playoffData, setPlayoffData] = useState(null);
  const [standings, setStandings] = useState([]);
  const [isGeneratePlayoffOpen, setIsGeneratePlayoffOpen] = useState(false);
  const [isGeneratingPlayoffs, setIsGeneratingPlayoffs] = useState(false);
  const [officialsModalMatch, setOfficialsModalMatch] = useState(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isInviteMembersOpen, setIsInviteMembersOpen] = useState(false);

  useEffect(() => {
    loadAllStudioData();
  }, [tournamentId]);

  const loadAllStudioData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [tRes, vRes, teamsRes, gTeamsRes, mRes, pRes, ptRes] = await Promise.all([
        api.getTournament(tournamentId),
        api.getTournamentVenues(tournamentId),
        api.getTournamentTeams(tournamentId),
        api.getGlobalTeams(),
        api.getTournamentMatches(tournamentId),
        api.getTournamentPlayoffs(tournamentId).catch(() => ({ data: null })),
        api.getTournamentPointsTable(tournamentId).catch(() => ({ data: [] })),
      ]);
      setTournament(tRes.data);
      setVenues(vRes.data || []);
      setTeams(teamsRes.data || []);
      setGlobalTeams(gTeamsRes.data || []);
      setMatches(mRes.data || []);
      setPlayoffData(pRes?.data || null);
      setStandings(ptRes?.data || []);
      if (gTeamsRes.data?.length > 0) {
        setSelectedGlobalTeamId(gTeamsRes.data[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load tournament studio data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePlayoffs = async (payload) => {
    setIsGeneratingPlayoffs(true);
    try {
      await api.generateTournamentPlayoffs(tournamentId, payload, userId);
      setIsGeneratePlayoffOpen(false);
      await loadAllStudioData();
      alert('Playoff bracket successfully generated!');
    } catch (err) {
      alert(err.message || 'Failed to generate playoffs');
    } finally {
      setIsGeneratingPlayoffs(false);
    }
  };

  const handleAddVenue = async (e) => {
    e.preventDefault();
    if (!newVenueName || !newVenueCity) return;
    setIsAddingVenue(true);
    try {
      await api.createTournamentVenue(
        tournamentId,
        {
          name: newVenueName,
          ground_name: newVenueGround || null,
          city: newVenueCity,
        },
        userId
      );
      setNewVenueName('');
      setNewVenueGround('');
      setNewVenueCity('');
      const vRes = await api.getTournamentVenues(tournamentId);
      setVenues(vRes.data || []);
    } catch (err) {
      alert(err.message || 'Failed to add venue');
    } finally {
      setIsAddingVenue(false);
    }
  };

  const handleRegisterTeam = async (e) => {
    e.preventDefault();
    if (!selectedGlobalTeamId) return;
    setIsRegisteringTeam(true);
    try {
      await api.registerTeamToTournament(tournamentId, { teamId: selectedGlobalTeamId, groupName }, userId);
      const teamsRes = await api.getTournamentTeams(tournamentId);
      setTeams(teamsRes.data || []);
    } catch (err) {
      alert(err.message || 'Failed to register team');
    } finally {
      setIsRegisteringTeam(false);
    }
  };

  const handleAllocateVenue = async (matchId, venueId) => {
    try {
      await api.allocateMatchVenue(matchId, venueId || null, userId);
      const mRes = await api.getTournamentMatches(tournamentId);
      setMatches(mRes.data || []);
    } catch (err) {
      alert(err.message || 'Failed to allocate venue');
    }
  };

  const handleViewAudit = async (match) => {
    try {
      const res = await api.getMatchAuditTrail(match.id);
      setAuditLogs(res.data || []);
      setActiveAuditMatch(match);
    } catch (err) {
      alert(err.message || 'Failed to load audit logs');
    }
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '40px auto', textAlign: 'center', color: '#64748b' }}>
        Loading Tournament Studio...
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '20px', background: '#7f1d1d', color: '#fca5a5', borderRadius: '8px' }}>
        {error || 'Tournament not found'}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Studio Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: '#f8fafc' }}>
              🛠️ {tournament.name} Studio
            </h1>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '12px',
                background: '#0284c722',
                color: '#38bdf8',
                border: '1px solid #0284c7',
                textTransform: 'uppercase',
              }}
            >
              {tournament.status}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Official administration console for venues, squad rosters, fixture scheduling, and match resolution.
          </p>
        </div>

        <button
          onClick={onBackToHub}
          style={{
            padding: '8px 16px',
            background: '#334155',
            border: 'none',
            borderRadius: '6px',
            color: '#f8fafc',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          ← Back to Tournament Hub
        </button>
        <button
          onClick={() => setIsInviteMembersOpen(true)}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid #10b981',
            borderRadius: '6px',
            color: '#10b981',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            marginLeft: '8px',
          }}
        >
          ✉️ Invite Officials
        </button>
        <button
          onClick={() => setIsExportDialogOpen(true)}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid #38bdf8',
            borderRadius: '6px',
            color: '#38bdf8',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            marginLeft: '8px',
          }}
        >
          📦 Export Archive
        </button>
      </div>

      {/* Tabs Bar */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
        {[
          { key: 'SETTINGS', label: '⚙️ Lifecycle & Rules' },
          { key: 'VENUES', label: `🏟️ Venues (${venues.length})` },
          { key: 'TEAMS', label: `👥 Teams & Squads (${teams.length})` },
          { key: 'FIXTURES', label: `📅 Fixtures & Lifecycle (${matches.length})` },
          { key: 'OPERATIONS', label: `🛡️ Schedule Matrix & Officials` },
          { key: 'PLAYOFFS', label: `🎯 Playoffs ${playoffData?.matches?.length > 0 ? `(${playoffData.matches.length})` : ''}` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === tab.key ? '#0284c7' : '#1e293b',
              color: activeTab === tab.key ? '#ffffff' : '#94a3b8',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: SETTINGS & LIFECYCLE */}
      {activeTab === 'SETTINGS' && (
        <TournamentSettingsForm
          tournament={tournament}
          userId={userId}
          onTournamentUpdated={(updated) => setTournament(updated)}
        />
      )}

      {/* TAB 2: VENUES */}
      {activeTab === 'VENUES' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {/* Add Venue Form */}
          <form
            onSubmit={handleAddVenue}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              height: 'fit-content',
            }}
          >
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>➕ Register New Venue</h3>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Venue Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Shivaji Park Ground"
                value={newVenueName}
                onChange={(e) => setNewVenueName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Pitch / Ground Detail</label>
              <input
                type="text"
                placeholder="e.g. Pitch #2 (Center)"
                value={newVenueGround}
                onChange={(e) => setNewVenueGround(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>City</label>
              <input
                type="text"
                required
                placeholder="e.g. Mumbai"
                value={newVenueCity}
                onChange={(e) => setNewVenueCity(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
              />
            </div>
            <button
              type="submit"
              disabled={isAddingVenue}
              style={{
                marginTop: '8px',
                padding: '10px',
                background: '#10b981',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isAddingVenue ? 'Saving...' : 'Add Venue'}
            </button>
          </form>

          {/* Venues List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>
              🏟️ Registered Tournament Venues ({venues.length})
            </h3>
            {venues.length === 0 ? (
              <div style={{ padding: '24px', background: '#0f172a', borderRadius: '8px', color: '#94a3b8' }}>
                No venues registered yet. Add a venue to allocate to fixtures.
              </div>
            ) : (
              venues.map((v) => (
                <div
                  key={v.id}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1rem' }}>{v.name}</h4>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
                      📍 {v.city} {v.ground_name && `• ${v.ground_name}`}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#10b981', background: '#064e3b', padding: '4px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    Active Ground
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TEAMS & SQUADS */}
      {activeTab === 'TEAMS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Register Team Bar */}
          <form
            onSubmit={handleRegisterTeam}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '16px 20px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 240px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                Select Global Team
              </label>
              <select
                value={selectedGlobalTeamId}
                onChange={(e) => setSelectedGlobalTeamId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
              >
                {globalTeams.map((gt) => (
                  <option key={gt.id} value={gt.id}>
                    {gt.name} ({gt.short_name}) - {gt.city || 'Club'}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ width: '140px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                Group
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc' }}
              />
            </div>

            <button
              type="submit"
              disabled={isRegisteringTeam || !selectedGlobalTeamId}
              style={{
                alignSelf: 'flex-end',
                padding: '8px 16px',
                background: '#0284c7',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isRegisteringTeam ? 'Registering...' : '+ Enroll Team into Tournament'}
            </button>
          </form>

          {/* Registered Teams Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {teams.map((t) => (
              <div
                key={t.tournament_team_id}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1.05rem' }}>
                    {t.team_name} ({t.short_name})
                  </h4>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                    Group: {t.group_name} • Roster: {t.roster_player_count} Players
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SquadVerificationBadge
                    status={t.squad_status || 'DRAFT'}
                    roster={t.roster || []}
                    tournamentTeamId={t.tournament_team_id}
                    tournamentId={tournamentId}
                    userId={userId}
                    isOrganizer={true}
                    onStatusChange={loadAllStudioData}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#38bdf8', background: '#0c4a6e', padding: '4px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    Enrolled
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: FIXTURES & OPERATIONS */}
      {activeTab === 'FIXTURES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>
              📅 Fixture Operations & Lifecycle Resolution
            </h3>
            <button
              onClick={() => setShowScheduleModal(true)}
              style={{
                padding: '8px 16px',
                background: '#10b981',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ➕ Schedule Fixture
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {matches.map((m) => {
              const isTerminal = m.status === 'COMPLETED' || m.status === 'ABANDONED';
              return (
                <div
                  key={m.id}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                        Match #{m.match_number} • {m.stage}
                      </span>
                      <h4 style={{ margin: '4px 0 0 0', color: '#f8fafc', fontSize: '1.1rem' }}>
                        {m.team_a_name} vs {m.team_b_name}
                      </h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '4px 10px',
                          borderRadius: '12px',
                          background: isTerminal ? '#334155' : '#0284c722',
                          color: isTerminal ? '#94a3b8' : '#38bdf8',
                          border: `1px solid ${isTerminal ? '#475569' : '#0284c7'}`,
                        }}
                      >
                        {m.status}
                      </span>

                      {/* Operations buttons */}
                      {!isTerminal && (
                        <>
                          <button
                            onClick={() => setActiveAssignMatch(m)}
                            style={{
                              padding: '6px 12px',
                              background: '#1e293b',
                              border: '1px solid #475569',
                              color: '#f8fafc',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            📝 Scorers
                          </button>
                          <button
                            onClick={() => setActiveResolveMatch(m)}
                            style={{
                              padding: '6px 12px',
                              background: '#f59e0b',
                              border: 'none',
                              color: '#000000',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            ⚖️ Resolve Match
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => setOfficialsModalMatch(m)}
                        style={{
                          padding: '6px 12px',
                          background: '#1e293b',
                          border: '1px solid #38bdf8',
                          color: '#38bdf8',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        👮 Officials
                      </button>

                      <button
                        onClick={() => handleViewAudit(m)}
                        style={{
                          padding: '6px 12px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          color: '#94a3b8',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        📜 Audit Trail
                      </button>
                    </div>
                  </div>

                  {/* Venue allocation dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Allocated Venue:</span>
                    <select
                      disabled={isTerminal}
                      value={m.venue_id || ''}
                      onChange={(e) => handleAllocateVenue(m.id, e.target.value)}
                      style={{
                        padding: '4px 8px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '0.8rem',
                      }}
                    >
                      <option value="">No Venue Assigned</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.city})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: OPERATIONS & SCHEDULE MATRIX */}
      {activeTab === 'OPERATIONS' && (
        <ScheduleMatrixView
          matches={matches}
          venues={venues}
          tournamentId={tournamentId}
          userId={userId}
          onRefresh={loadAllStudioData}
          onOpenOfficialsModal={(m) => setOfficialsModalMatch(m)}
        />
      )}

      {/* TAB 5: PLAYOFFS */}
      {activeTab === 'PLAYOFFS' && (
        <PlayoffAdminTab
          playoffData={playoffData}
          standings={standings}
          venues={venues}
          onOpenGenerateModal={() => setIsGeneratePlayoffOpen(true)}
          onSelectMatch={() => {}}
          onOpenResolveMatch={(m) => setActiveResolveMatch(m)}
          onOpenAssignScorer={(m) => setActiveAssignMatch(m)}
        />
      )}

      {/* Generate Playoff Modal */}
      <GeneratePlayoffModal
        isOpen={isGeneratePlayoffOpen}
        onClose={() => setIsGeneratePlayoffOpen(false)}
        standings={standings}
        venues={venues}
        onGenerate={handleGeneratePlayoffs}
        isSubmitting={isGeneratingPlayoffs}
      />

      {/* Schedule Fixture Modal */}
      {showScheduleModal && (
        <CreateFixtureModal
          tournamentId={tournamentId}
          userId={userId}
          teams={teams}
          venues={venues}
          onClose={() => setShowScheduleModal(false)}
          onFixtureCreated={() => {
            setShowScheduleModal(false);
            api.getTournamentMatches(tournamentId).then((r) => setMatches(r.data || []));
          }}
        />
      )}

      {/* Assign Scorer Modal */}
      {activeAssignMatch && (
        <AssignScorerModal
          match={activeAssignMatch}
          tournamentId={tournamentId}
          userId={userId}
          onClose={() => setActiveAssignMatch(null)}
        />
      )}

      {/* Resolve Match Modal */}
      {activeResolveMatch && (
        <ResolveMatchModal
          match={activeResolveMatch}
          userId={userId}
          onClose={() => setActiveResolveMatch(null)}
          onMatchResolved={() => {
            setActiveResolveMatch(null);
            api.getTournamentMatches(tournamentId).then((r) => setMatches(r.data || []));
          }}
        />
      )}

      {/* Audit Trail Modal */}
      {activeAuditMatch && (
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
              maxWidth: '560px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem' }}>
                📜 Match Lifecycle Audit Trail
              </h3>
              <button
                onClick={() => setActiveAuditMatch(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Match #{activeAuditMatch.match_number}: {activeAuditMatch.team_a_name} vs {activeAuditMatch.team_b_name}
            </div>

            {auditLogs.length === 0 ? (
              <div style={{ padding: '16px', background: '#1e293b', borderRadius: '8px', color: '#94a3b8' }}>
                No administrative state changes recorded yet for this fixture.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      background: '#1e293b',
                      borderRadius: '8px',
                      padding: '12px',
                      border: '1px solid #334155',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
                      <span>Changed by: <strong>{log.changed_by_name}</strong></span>
                      <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '0.9rem', color: '#f8fafc', fontWeight: 700 }}>
                      Transition: {log.previous_status} → {log.new_status}
                    </div>
                    {log.reason && (
                      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                        Reason: {log.reason}
                      </div>
                    )}
                    {log.result_type && (
                      <div style={{ marginTop: '2px', fontSize: '0.75rem', color: '#38bdf8' }}>
                        Result: {log.result_type}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setActiveAuditMatch(null)}
              style={{
                alignSelf: 'flex-end',
                padding: '8px 16px',
                background: '#334155',
                border: 'none',
                borderRadius: '6px',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Officials Assignment Modal */}
      {officialsModalMatch && (
        <OfficialsAssignmentModal
          isOpen={!!officialsModalMatch}
          onClose={() => setOfficialsModalMatch(null)}
          match={officialsModalMatch}
          tournamentId={tournamentId}
          userId={userId}
        />
      )}

      {/* Tournament Export Dialog */}
      <TournamentExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        tournamentId={tournamentId}
        tournamentName={tournament?.name}
        userId={userId}
      />

      {/* Organizer Member Invitations Modal */}
      <InviteMembersModal
        isOpen={isInviteMembersOpen}
        onClose={() => setIsInviteMembersOpen(false)}
        tournamentId={tournamentId}
        userId={userId}
      />
    </div>
  );
}
