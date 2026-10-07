import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { SquadSelector } from '../components/setup/SquadSelector.jsx';
import { TossSetup } from '../components/setup/TossSetup.jsx';
import { OpenersSetup } from '../components/setup/OpenersSetup.jsx';
import { Toast } from '../components/common/Toast.jsx';

export function MatchSetupPage({ matchId, userId, onSetupComplete }) {
  const [match, setMatch] = useState(null);
  const [squads, setSquads] = useState(null);
  const [step, setStep] = useState('SQUADS_A'); // SQUADS_A -> SQUADS_B -> TOSS -> OPENERS
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState([]);

  const addToast = (title, message, type = 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const loadMatchData = async () => {
    try {
      setLoading(true);
      const [matchRes, squadsRes] = await Promise.all([
        api.getMatch(matchId),
        api.getMatchSquads(matchId),
      ]);
      setMatch(matchRes.data);
      setSquads(squadsRes.data);

      // Determine initial setup step based on match state
      if (matchRes.data.status === 'IN_PROGRESS') {
        onSetupComplete();
        return;
      }
      if (!matchRes.data.toss_winner_team_id) {
        // If Playing XIs are confirmed
        if (squadsRes.data.team_a?.playing_xi?.length === 11 && squadsRes.data.team_b?.playing_xi?.length === 11) {
          setStep('TOSS');
        } else if (squadsRes.data.team_a?.playing_xi?.length === 11) {
          setStep('SQUADS_B');
        } else {
          setStep('SQUADS_A');
        }
      } else {
        setStep('OPENERS');
      }
    } catch (err) {
      addToast('Data Fetch Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatchData();
  }, [matchId]);

  const handleSquadSubmit = async (squadPayload) => {
    try {
      setIsSubmitting(true);
      await api.submitPlayingXI(matchId, squadPayload, userId);
      addToast('Squad Saved', 'Playing XI confirmed successfully!', 'success');
      const updatedSquads = await api.getMatchSquads(matchId);
      setSquads(updatedSquads.data);

      if (step === 'SQUADS_A') {
        setStep('SQUADS_B');
      } else if (step === 'SQUADS_B') {
        setStep('TOSS');
      }
    } catch (err) {
      addToast('Squad Confirmation Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTossSubmit = async (tossPayload) => {
    try {
      setIsSubmitting(true);
      await api.setToss(matchId, tossPayload, userId);
      addToast('Toss Saved', 'Toss decision recorded!', 'success');
      const updatedMatch = await api.getMatch(matchId);
      setMatch(updatedMatch.data);
      setStep('OPENERS');
    } catch (err) {
      addToast('Toss Setup Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenersSubmit = async (openersPayload) => {
    try {
      setIsSubmitting(true);
      await api.startInnings(matchId, openersPayload, userId);
      addToast('Innings Initialized', 'Innings 1 started! Launching scoring console...', 'success');
      onSetupComplete();
    } catch (err) {
      addToast('Innings Start Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>
        <p>Loading match configuration...</p>
      </div>
    );
  }

  // Determine batting & bowling teams from toss
  const isTeamABatting = match?.toss_winner_team_id === match?.team_a_id
    ? match?.toss_decision === 'BAT'
    : match?.toss_decision === 'BOWL';

  const battingTeamId = isTeamABatting ? match?.team_a_id : match?.team_b_id;
  const bowlingTeamId = isTeamABatting ? match?.team_b_id : match?.team_a_id;
  const battingTeamName = isTeamABatting ? match?.team_a_name : match?.team_b_name;
  const bowlingTeamName = isTeamABatting ? match?.team_b_name : match?.team_a_name;

  const battingSquad = isTeamABatting ? squads?.team_a?.playing_xi : squads?.team_b?.playing_xi;
  const bowlingSquad = isTeamABatting ? squads?.team_b?.playing_xi : squads?.team_a?.playing_xi;

  return (
    <div className="container">
      <Toast toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Setup Step Progress Header */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Match Setup Wizard</h2>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['SQUADS_A', 'SQUADS_B', 'TOSS', 'OPENERS'].map((s, idx) => (
            <span
              key={s}
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: step === s ? '#38bdf8' : '#334155',
              }}
            />
          ))}
        </div>
      </div>

      {step === 'SQUADS_A' && (
        <SquadSelector
          teamName={match?.team_a_name || 'Team A'}
          tournamentTeamId={match?.team_a_id}
          squadData={squads?.team_a}
          onSubmitSquad={handleSquadSubmit}
          isSubmitting={isSubmitting}
        />
      )}

      {step === 'SQUADS_B' && (
        <SquadSelector
          teamName={match?.team_b_name || 'Team B'}
          tournamentTeamId={match?.team_b_id}
          squadData={squads?.team_b}
          onSubmitSquad={handleSquadSubmit}
          isSubmitting={isSubmitting}
        />
      )}

      {step === 'TOSS' && (
        <TossSetup
          match={match}
          onSubmitToss={handleTossSubmit}
          isSubmitting={isSubmitting}
        />
      )}

      {step === 'OPENERS' && (
        <OpenersSetup
          battingTeamName={battingTeamName}
          bowlingTeamName={bowlingTeamName}
          battingTeamId={battingTeamId}
          bowlingTeamId={bowlingTeamId}
          battingSquad={battingSquad || []}
          bowlingSquad={bowlingSquad || []}
          inningsNumber={1}
          onSubmitOpeners={handleOpenersSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
