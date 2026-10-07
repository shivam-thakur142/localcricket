import React, { useState, useEffect } from 'react';
import { HomePage } from './pages/HomePage.jsx';
import { TournamentHubPage } from './pages/TournamentHubPage.jsx';
import { OrganizerStudioPage } from './pages/OrganizerStudioPage.jsx';
import { ScorerConsolePage } from './pages/ScorerConsolePage.jsx';
import { MatchSetupPage } from './pages/MatchSetupPage.jsx';
import { SpectatorMatchPage } from './pages/SpectatorMatchPage.jsx';
import { PlayerProfilePage } from './pages/PlayerProfilePage.jsx';
import { TeamProfilePage } from './pages/TeamProfilePage.jsx';
import { InvitationAcceptPage } from './pages/InvitationAcceptPage.jsx';
import { SuperAdminPage } from './pages/SuperAdminPage.jsx';
import { PersonaSwitcher, DEMO_PERSONAS } from './components/layout/PersonaSwitcher.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { offlineQueueService } from './services/offlineQueueService.js';
import { AuthModal } from './components/auth/AuthModal.jsx';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal.jsx';

const DEFAULT_TOURNAMENT_ID = '33333333-3333-3333-3333-333333333333';
const DEFAULT_MATCH_ID = '88888888-8888-8888-8888-888888888888';
const DEFAULT_ORGANIZER_ID = '11111111-1111-1111-1111-111111111111';

function AppContent() {
  const { user, isAuthenticated, login, logout } = useAuth();

  const [tournamentId, setTournamentId] = useState(DEFAULT_TOURNAMENT_ID);
  const [matchId, setMatchId] = useState(DEFAULT_MATCH_ID);
  const [userId, setUserId] = useState(DEFAULT_ORGANIZER_ID);

  // Check URL pathname for /invitations/:token
  const inviteTokenMatch = typeof window !== 'undefined' ? window.location.pathname.match(/\/invitations\/([a-zA-Z0-9_-]+)/) : null;
  const [inviteToken, setInviteToken] = useState(inviteTokenMatch ? inviteTokenMatch[1] : null);
  const [view, setView] = useState(inviteTokenMatch ? 'INVITATION' : 'HOME'); // 'HOME' | 'TOURNAMENT' | 'STUDIO' | 'SCORER' | 'SETUP' | 'SPECTATOR' | 'PLAYER' | 'TEAM' | 'INVITATION'

  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [previousView, setPreviousView] = useState('HOME');

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('LOGIN');
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Sync userId when user logs in or out
  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
    }
  }, [user]);

  const handleLaunchScorer = (selectedMatchId) => {
    setMatchId(selectedMatchId);
    setView('SCORER');
  };

  const handleLaunchSpectator = (selectedMatchId) => {
    setMatchId(selectedMatchId);
    setView('SPECTATOR');
  };

  const handleOpenStudio = (selectedTournamentId) => {
    if (selectedTournamentId) {
      setTournamentId(selectedTournamentId);
    }
    setView('STUDIO');
  };

  const handleSelectTournament = (selectedTournamentId) => {
    setTournamentId(selectedTournamentId);
    setView('TOURNAMENT');
  };

  const handleSelectPlayer = (pId) => {
    if (!pId) return;
    setPreviousView(view);
    setSelectedPlayerId(pId);
    setView('PLAYER');
  };

  const handleSelectTeam = (tId) => {
    if (!tId) return;
    setPreviousView(view);
    setSelectedTeamId(tId);
    setView('TEAM');
  };

  const handleBackFromProfile = () => {
    setView(previousView || 'HOME');
  };

  const handleSelectPersona = async (persona) => {
    setUserId(persona.id);
    if (persona.email) {
      try {
        await login({ email: persona.email, password: 'LocalCricket@2026!' });
      } catch (err) {
        console.warn('Persona login fallback:', err.message);
      }
    } else {
      if (userId) {
        await offlineQueueService.clearUserSession(userId);
      }
      await logout();
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top App Header */}
      <header
        style={{
          background: '#090d16',
          borderBottom: '1px solid var(--border-color)',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setView('HOME')}>
          <span style={{ fontSize: '1.5rem' }}>🏏</span>
          <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Local<span style={{ color: '#38bdf8' }}>Cricket</span>
          </span>
        </div>

        {/* View Switchers */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setView('HOME')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: view === 'HOME' ? '#0284c7' : 'var(--bg-accent)',
              color: view === 'HOME' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Home
          </button>
          <button
            onClick={() => setView('TOURNAMENT')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: view === 'TOURNAMENT' ? '#0284c7' : 'var(--bg-accent)',
              color: view === 'TOURNAMENT' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Hub
          </button>
          <button
            onClick={() => setView('STUDIO')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: view === 'STUDIO' ? '#0284c7' : 'var(--bg-accent)',
              color: view === 'STUDIO' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Studio
          </button>
          <button
            onClick={() => setView('SCORER')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: view === 'SCORER' ? '#0284c7' : 'var(--bg-accent)',
              color: view === 'SCORER' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Scorer
          </button>
          <button
            onClick={() => setView('SETUP')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: view === 'SETUP' ? '#0284c7' : 'var(--bg-accent)',
              color: view === 'SETUP' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Setup
          </button>
          <button
            onClick={() => setView('SPECTATOR')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: view === 'SPECTATOR' ? '#0284c7' : 'var(--bg-accent)',
              color: view === 'SPECTATOR' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Spectator
          </button>
          {user?.global_role === 'SUPER_ADMIN' && (
            <button
              onClick={() => setView('ADMIN')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: view === 'ADMIN' ? '#ef4444' : '#450a0a',
                color: view === 'ADMIN' ? '#ffffff' : '#f87171',
              }}
            >
              ⚡ Admin
            </button>
          )}
        </div>

        {/* Right Section: Auth State + Persona Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.75rem' }}>
                <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                  👤 {user?.fullName || user?.email}
                </span>
                <span style={{ color: '#38bdf8', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                  {user?.role || 'User'}
                </span>
              </div>
              <button
                onClick={() => setIsChangePasswordOpen(true)}
                title="Change Password"
                style={{
                  background: '#1e293b',
                  border: '1px solid var(--border-color)',
                  color: '#94a3b8',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                🔑
              </button>
              <button
                onClick={logout}
                title="Sign Out"
                style={{
                  background: '#7f1d1d',
                  border: '1px solid #ef4444',
                  color: '#fecaca',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => {
                  setAuthModalMode('LOGIN');
                  setIsAuthModalOpen(true);
                }}
                style={{
                  background: '#0284c7',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthModalMode('REGISTER');
                  setIsAuthModalOpen(true);
                }}
                style={{
                  background: '#1e293b',
                  border: '1px solid var(--border-color)',
                  color: '#94a3b8',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Register
              </button>
            </div>
          )}

          {/* Demo Persona Switcher */}
          <PersonaSwitcher
            currentUserId={userId}
            onSelectPersona={handleSelectPersona}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, paddingBottom: '24px' }}>
        {view === 'INVITATION' && (
          <InvitationAcceptPage
            token={inviteToken}
            onNavigateToTournament={(tId) => {
              setTournamentId(tId);
              setView('TOURNAMENT');
            }}
          />
        )}

        {view === 'HOME' && (
          <HomePage
            userId={userId}
            onSelectTournament={handleSelectTournament}
            onSelectMatchForSpectator={handleLaunchSpectator}
            onOpenStudio={handleOpenStudio}
          />
        )}

        {view === 'TOURNAMENT' && (
          <TournamentHubPage
            tournamentId={tournamentId}
            userId={userId}
            onSelectMatchForScorer={handleLaunchScorer}
            onSelectMatchForSpectator={handleLaunchSpectator}
            onOpenStudio={handleOpenStudio}
            onSelectPlayer={handleSelectPlayer}
            onSelectTeam={handleSelectTeam}
          />
        )}

        {view === 'STUDIO' && (
          <OrganizerStudioPage
            tournamentId={tournamentId}
            userId={userId}
            onBackToHub={() => setView('TOURNAMENT')}
          />
        )}

        {view === 'SCORER' && (
          <ScorerConsolePage matchId={matchId} userId={userId} />
        )}

        {view === 'SETUP' && (
          <MatchSetupPage
            matchId={matchId}
            userId={userId}
            onSetupComplete={() => setView('SCORER')}
          />
        )}

        {view === 'SPECTATOR' && (
          <SpectatorMatchPage
            matchId={matchId}
            onSelectPlayer={handleSelectPlayer}
            onSelectTeam={handleSelectTeam}
          />
        )}

        {view === 'PLAYER' && (
          <PlayerProfilePage
            playerId={selectedPlayerId}
            tournamentId={tournamentId}
            onBack={handleBackFromProfile}
          />
        )}

        {view === 'TEAM' && (
          <TeamProfilePage
            teamId={selectedTeamId}
            tournamentId={tournamentId}
            onBack={handleBackFromProfile}
            onSelectPlayer={handleSelectPlayer}
          />
        )}

        {view === 'ADMIN' && (
          <SuperAdminPage />
        )}
      </main>

      {/* Authentication & Profile Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
