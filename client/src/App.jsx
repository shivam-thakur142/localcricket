import React, { useState } from 'react';
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
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { AuthModal } from './components/auth/AuthModal.jsx';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal.jsx';

function AppContent() {
  const { user, isAuthenticated, logout } = useAuth();

  const [tournamentId, setTournamentId] = useState(null);
  const [matchId, setMatchId] = useState(null);
  const userId = user?.id || null;

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

        {/* Right Section: Signed-in account */}
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
            isAuthenticated={isAuthenticated}
            onRequireAuth={() => {
              setAuthModalMode('LOGIN');
              setIsAuthModalOpen(true);
            }}
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
          tournamentId ? (
            <OrganizerStudioPage
              tournamentId={tournamentId}
              userId={userId}
              onBackToHub={() => setView('TOURNAMENT')}
            />
          ) : <SelectionPrompt message="Choose a tournament from Home before opening its organizer studio." onHome={() => setView('HOME')} />
        )}

        {view === 'SCORER' && (
          matchId ? <ScorerConsolePage matchId={matchId} userId={userId} /> : <SelectionPrompt message="Choose a real fixture from a tournament before opening the scorer." onHome={() => setView('HOME')} />
        )}

        {view === 'SETUP' && (
          matchId ? (
            <MatchSetupPage
              matchId={matchId}
              userId={userId}
              onSetupComplete={() => setView('SCORER')}
            />
          ) : <SelectionPrompt message="Choose a real fixture from a tournament before opening match setup." onHome={() => setView('HOME')} />
        )}

        {view === 'SPECTATOR' && (
          matchId ? (
            <SpectatorMatchPage
              matchId={matchId}
              onSelectPlayer={handleSelectPlayer}
              onSelectTeam={handleSelectTeam}
            />
          ) : <SelectionPrompt message="Choose a real fixture from a tournament to view its live score." onHome={() => setView('HOME')} />
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

function SelectionPrompt({ message, onHome }) {
  return (
    <div style={{ maxWidth: '720px', margin: '48px auto', padding: '24px', color: '#f8fafc', textAlign: 'center', background: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}>
      <h2 style={{ marginTop: 0 }}>Select a tournament or match</h2>
      <p style={{ color: '#94a3b8' }}>{message}</p>
      <button onClick={onHome} style={{ padding: '9px 16px', border: 0, borderRadius: '6px', background: '#0284c7', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Go to Home</button>
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
