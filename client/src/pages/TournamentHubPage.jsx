import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import { PointsTable } from '../components/tournament/PointsTable.jsx';
import { FixtureCard } from '../components/tournament/FixtureCard.jsx';
import { CreateFixtureModal } from '../components/tournament/CreateFixtureModal.jsx';
import { LeaderboardsTable } from '../components/tournament/LeaderboardsTable.jsx';
import { PlayoffBracket } from '../components/tournament/PlayoffBracket.jsx';
import { ChampionPodium } from '../components/tournament/ChampionPodium.jsx';
import { AwardsTab } from '../components/tournament/AwardsTab.jsx';
import { RecordsTab } from '../components/tournament/RecordsTab.jsx';
import { SquadVerificationBadge } from '../components/tournament/SquadVerificationBadge.jsx';
import { TournamentExportDialog } from '../components/tournament/TournamentExportDialog.jsx';
import { Toast } from '../components/common/Toast.jsx';

export function TournamentHubPage({ tournamentId, userId, onSelectMatchForScorer, onSelectMatchForSpectator, onOpenStudio, onSelectPlayer, onSelectTeam }) {
  const [tournament, setTournament] = useState(null);
  const [standings, setStandings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [playoffData, setPlayoffData] = useState(null);
  const [selectedTeamRoster, setSelectedTeamRoster] = useState(null);

  const [activeTab, setActiveTab] = useState('STANDINGS'); // 'STANDINGS' | 'FIXTURES' | 'TEAMS' | 'LEADERBOARDS' | 'PLAYOFFS'
  const [fixtureFilter, setFixtureFilter] = useState('ALL'); // 'ALL' | 'LIVE' | 'SCHEDULED' | 'COMPLETED'
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFixtureModalOpen, setIsFixtureModalOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  const addToast = (title, message, type = 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const loadTournamentData = useCallback(async () => {
    try {
      const [tRes, ptRes, mRes, tmRes, pRes] = await Promise.all([
        api.getTournament(tournamentId),
        api.getTournamentPointsTable(tournamentId),
        api.getTournamentMatches(tournamentId),
        api.getTournamentTeams(tournamentId),
        api.getTournamentPlayoffs(tournamentId).catch(() => ({ data: null })),
      ]);
      setTournament(tRes.data);
      setStandings(ptRes.data || []);
      setMatches(mRes.data || []);
      setTeams(tmRes.data || []);
      setPlayoffData(pRes?.data || null);
    } catch (err) {
      addToast('Data Fetch Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    loadTournamentData();
  }, [loadTournamentData]);

  const handleRecalculatePoints = async () => {
    try {
      setIsRefreshing(true);
      await api.recalculatePointsTable(tournamentId, userId);
      addToast('Points Table Recalculated', 'Standings updated successfully!', 'success');
      const updated = await api.getTournamentPointsTable(tournamentId);
      setStandings(updated.data || []);
    } catch (err) {
      addToast('Recalculation Error', err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateFixture = async (fixtureData) => {
    try {
      await api.createFixture(tournamentId, fixtureData, userId);
      addToast('Fixture Created', `Match #${fixtureData.match_number} scheduled successfully!`, 'success');
      const updatedMatches = await api.getTournamentMatches(tournamentId);
      setMatches(updatedMatches.data || []);
    } catch (err) {
      addToast('Scheduling Error', err.message);
    }
  };

  const handleViewRoster = async (tournamentTeamId) => {
    try {
      const res = await api.getTeamRoster(tournamentId, tournamentTeamId);
      setSelectedTeamRoster(res.data || []);
    } catch (err) {
      addToast('Roster Error', err.message);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>
        <p>Loading tournament hub...</p>
      </div>
    );
  }

  const filteredMatches = matches.filter((m) => {
    if (fixtureFilter === 'LIVE') return m.status === 'IN_PROGRESS';
    if (fixtureFilter === 'SCHEDULED') return m.status === 'SCHEDULED';
    if (fixtureFilter === 'COMPLETED') return m.status === 'COMPLETED';
    return true;
  });

  return (
    <div className="container">
      <Toast toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Tournament Header Banner */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>
              {tournament?.city} • {tournament?.format} ({tournament?.overs_per_innings} overs)
            </span>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
              {tournament?.name}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onOpenStudio && (
              <button
                onClick={() => onOpenStudio(tournamentId)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                ⚙️ Admin Studio
              </button>
            )}
            <button
              onClick={() => setIsExportDialogOpen(true)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #38bdf8',
                background: 'transparent',
                color: '#38bdf8',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              📦 Export
            </button>
            <span style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', background: '#334155', color: '#f8fafc', fontWeight: 600 }}>
              {tournament?.status}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <span>Win: <strong>{tournament?.points_for_win || 2} pts</strong></span>
          <span>Tie: <strong>{tournament?.points_for_tie || 1} pt</strong></span>
          <span>NR: <strong>{tournament?.points_for_no_result || 1} pt</strong></span>
          <span>Ball: <strong>{tournament?.ball_type}</strong></span>
        </div>
      </div>

      {/* Champion Celebration Podium */}
      {playoffData?.champion && (
        <ChampionPodium
          champion={playoffData.champion}
          runnerUp={playoffData.runner_up}
          tournamentName={tournament?.name}
        />
      )}

      {/* Main Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('STANDINGS')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'STANDINGS' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'STANDINGS' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          📊 Standings
        </button>
        <button
          onClick={() => setActiveTab('FIXTURES')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'FIXTURES' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'FIXTURES' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          📅 Fixtures ({matches.length})
        </button>
        <button
          onClick={() => setActiveTab('TEAMS')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'TEAMS' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'TEAMS' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          👥 Teams ({teams.length})
        </button>
        <button
          onClick={() => setActiveTab('LEADERBOARDS')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'LEADERBOARDS' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'LEADERBOARDS' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          🏆 Leaderboards
        </button>
        <button
          onClick={() => setActiveTab('PLAYOFFS')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'PLAYOFFS' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'PLAYOFFS' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          🎯 Playoffs
        </button>
        <button
          onClick={() => setActiveTab('AWARDS')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'AWARDS' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'AWARDS' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          🏅 Awards
        </button>
        <button
          onClick={() => setActiveTab('RECORDS')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'RECORDS' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'RECORDS' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          📜 Records
        </button>
      </div>

      {/* TAB 1: STANDINGS */}
      {activeTab === 'STANDINGS' && (
        <PointsTable
          standings={standings}
          onRefresh={handleRecalculatePoints}
          isRefreshing={isRefreshing}
        />
      )}

      {/* TAB 2: FIXTURES */}
      {activeTab === 'FIXTURES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['ALL', 'LIVE', 'SCHEDULED', 'COMPLETED'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFixtureFilter(f)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: fixtureFilter === f ? '#0284c7' : 'var(--bg-accent)',
                    color: fixtureFilter === f ? '#ffffff' : 'var(--text-secondary)',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsFixtureModalOpen(true)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: '#10b981',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              + Schedule Match
            </button>
          </div>

          {filteredMatches.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
              No matches found matching filter "{fixtureFilter}".
            </div>
          ) : (
            filteredMatches.map((m) => (
              <FixtureCard
                key={m.id}
                match={m}
                onSelectScorer={onSelectMatchForScorer}
                onSelectSpectator={onSelectMatchForSpectator}
              />
            ))
          )}
        </div>
      )}

      {/* TAB 3: TEAMS & ROSTERS */}
      {activeTab === 'TEAMS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px', color: '#38bdf8' }}>
              Registered Teams
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {teams.map((t) => (
                <div
                  key={t.tournament_team_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-accent)',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: '#f8fafc' }}>{t.team_name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '6px' }}>({t.short_name})</span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Group: {t.group_name} • Registered Squad: {t.roster_player_count || 0} players
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SquadVerificationBadge
                      status={t.squad_status || 'DRAFT'}
                      roster={t.roster || []}
                      tournamentTeamId={t.tournament_team_id}
                      tournamentId={tournamentId}
                      userId={userId}
                      isOrganizer={!!onOpenStudio}
                      onStatusChange={loadTournamentData}
                    />
                    <button
                      onClick={() => handleViewRoster(t.tournament_team_id)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      View Squad
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Roster Modal / Drawer */}
          {selectedTeamRoster && (
            <div className="card" style={{ borderColor: '#38bdf8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#38bdf8' }}>Squad Roster</h4>
                <button
                  onClick={() => setSelectedTeamRoster(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedTeamRoster.map((p) => (
                  <div key={p.roster_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                    <span>
                      {p.full_name} <span style={{ color: 'var(--text-muted)' }}>#{p.jersey_number}</span>
                      {p.is_captain && <strong style={{ color: '#f59e0b', marginLeft: '4px' }}>(C)</strong>}
                      {p.is_wicket_keeper && <strong style={{ color: '#10b981', marginLeft: '4px' }}>(WK)</strong>}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{p.primary_role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: LEADERBOARDS */}
      {activeTab === 'LEADERBOARDS' && (
        <LeaderboardsTable tournamentId={tournamentId} />
      )}

      {/* TAB 5: PLAYOFFS & KNOCKOUT BRACKET */}
      {activeTab === 'PLAYOFFS' && (
        <PlayoffBracket
          playoffData={playoffData}
          onSelectMatch={onSelectMatchForSpectator}
          onOpenGenerateModal={() => onOpenStudio && onOpenStudio(tournamentId)}
          canManage={!!onOpenStudio}
        />
      )}

      {/* TAB 6: TOURNAMENT AWARDS & MVP */}
      {activeTab === 'AWARDS' && (
        <AwardsTab
          tournamentId={tournamentId}
          onSelectPlayer={onSelectPlayer}
          onSelectTeam={onSelectTeam}
        />
      )}

      {/* TAB 7: HISTORIC TOURNAMENT RECORDS */}
      {activeTab === 'RECORDS' && (
        <RecordsTab tournamentId={tournamentId} />
      )}

      {/* CREATE FIXTURE MODAL */}
      <CreateFixtureModal
        isOpen={isFixtureModalOpen}
        onClose={() => setIsFixtureModalOpen(false)}
        tournamentId={tournamentId}
        teams={teams}
        nextMatchNumber={matches.length + 1}
        defaultOvers={tournament?.overs_per_innings || 20}
        onSubmitFixture={handleCreateFixture}
      />

      {/* TOURNAMENT EXPORT DIALOG */}
      <TournamentExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        tournamentId={tournamentId}
        tournamentName={tournament?.name}
        userId={userId}
      />
    </div>
  );
}
