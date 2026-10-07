import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import { offlineStorage } from '../services/offlineStorage.js';
import { offlineQueueService, SYNC_STATUS } from '../services/offlineQueueService.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { triggerHaptic, triggerHapticCritical } from '../utils/haptics.js';
import { ScoreBanner } from '../components/match/ScoreBanner.jsx';
import { PitchStrip } from '../components/match/PitchStrip.jsx';
import { OverBallStrip } from '../components/match/OverBallStrip.jsx';
import { ScorecardTable } from '../components/match/ScorecardTable.jsx';
import { ScoringKeypad } from '../components/scorer/ScoringKeypad.jsx';
import { WicketModal } from '../components/scorer/WicketModal.jsx';
import { ExtrasModal } from '../components/scorer/ExtrasModal.jsx';
import { NextBowlerModal } from '../components/scorer/NextBowlerModal.jsx';
import { UndoConfirmModal } from '../components/scorer/UndoConfirmModal.jsx';
import { OpenersSetup } from '../components/setup/OpenersSetup.jsx';
import { Toast } from '../components/common/Toast.jsx';
import NetworkStatusBadge from '../components/common/NetworkStatusBadge.jsx';
import ConflictResolutionModal from '../components/scorer/ConflictResolutionModal.jsx';

export function ScorerConsolePage({ matchId, userId }) {
  const [match, setMatch] = useState(null);
  const [liveState, setLiveState] = useState(null);
  const [scorecard, setScorecard] = useState(null);
  const [squads, setSquads] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('LIVE'); // 'LIVE' | 'SCORECARD'

  // Offline queue & projected state
  const [pendingMutations, setPendingMutations] = useState([]);
  const [conflictData, setConflictData] = useState(null);

  // Field ergonomics: Keep screen on during live match scoring
  useWakeLock(true);

  // Modals state
  const [isWicketModalOpen, setIsWicketModalOpen] = useState(false);
  const [extrasModalConfig, setExtrasModalConfig] = useState({ isOpen: false, type: 'WIDE' });
  const [isNextBowlerModalOpen, setIsNextBowlerModalOpen] = useState(false);
  const [isUndoModalOpen, setIsUndoModalOpen] = useState(false);
  const [showInnings2Setup, setShowInnings2Setup] = useState(false);

  const [toasts, setToasts] = useState([]);

  const addToast = (title, message, type = 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const loadPendingMutations = useCallback(async () => {
    try {
      const mutations = await offlineStorage.getPendingMutations(matchId, userId);
      setPendingMutations(mutations);
    } catch {
      setPendingMutations([]);
    }
  }, [matchId, userId]);

  const fetchAuthoritativeState = useCallback(async () => {
    try {
      const [mRes, liveRes, cardRes, sqRes] = await Promise.all([
        api.getMatch(matchId),
        api.getMatchLive(matchId),
        api.getMatchScorecard(matchId),
        api.getMatchSquads(matchId),
      ]);
      setMatch(mRes.data);
      setLiveState(liveRes.data);
      setScorecard(cardRes.data);
      setSquads(sqRes.data);

      // Cache snapshot locally for offline cold-boot
      if (liveRes.data) {
        await offlineStorage.setMatchCache(userId, matchId, liveRes.data);
      }

      // Check if over completed and needs bowler nomination
      if (liveRes.data?.current_over?.is_completed && liveRes.data?.innings?.status === 'IN_PROGRESS') {
        setIsNextBowlerModalOpen(true);
      }
      // Check if innings 1 completed but innings 2 not started
      if (
        liveRes.data?.innings?.innings_number === 1 &&
        liveRes.data?.innings?.status === 'COMPLETED' &&
        mRes.data.status !== 'COMPLETED'
      ) {
        setShowInnings2Setup(true);
      }
    } catch (err) {
      // Fall back to offline match cache if available
      try {
        const cached = await offlineStorage.getMatchCache(userId, matchId);
        if (cached) {
          setLiveState(cached);
          addToast('Offline Mode', 'Displaying cached match scorecard.', 'warning');
        } else {
          addToast('Data Sync Error', err.message);
        }
      } catch {
        addToast('Data Sync Error', err.message);
      }
    } finally {
      setLoading(false);
      loadPendingMutations();
    }
  }, [matchId, userId, loadPendingMutations]);

  useEffect(() => {
    offlineQueueService.setCurrentUser(userId);
    fetchAuthoritativeState();

    const unsubQueue = offlineQueueService.subscribeQueue(() => {
      loadPendingMutations();
      fetchAuthoritativeState();
    });

    const unsubConflict = offlineQueueService.subscribeConflict((conflict) => {
      setConflictData(conflict);
    });

    return () => {
      unsubQueue();
      unsubConflict();
    };
  }, [fetchAuthoritativeState, loadPendingMutations, userId]);

  // Expected sequence for current delivery
  const expectedSequence = (liveState?.innings?.last_delivery_sequence || 0) + 1;

  // ----------------------------------------------------
  // MUTATION HANDLERS (QUEUED VIA OFFLINE QUEUE SERVICE)
  // ----------------------------------------------------
  const handleRecordDelivery = async (deliveryPayload) => {
    if (isSubmitting) return; // Rapid-tap lock guard

    try {
      setIsSubmitting(true);
      if (deliveryPayload.is_wicket) {
        triggerHapticCritical();
      } else {
        triggerHaptic(25);
      }

      const payload = {
        ...deliveryPayload,
        expected_sequence: expectedSequence,
      };

      // Queue delivery locally and drain
      await offlineQueueService.enqueueDelivery(
        matchId,
        match?.tournament_id,
        userId,
        payload,
        expectedSequence
      );

      addToast('Delivery Recorded', `Ball #${expectedSequence} queued`, 'success');
      await loadPendingMutations();
    } catch (err) {
      addToast('Scoring Error', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordRuns = (runs) => {
    handleRecordDelivery({
      runs_batter: runs,
      runs_extras: 0,
      extra_type: null,
      is_wicket: false,
    });
  };

  const handleNextBowlerSubmit = async (bowlerId) => {
    try {
      setIsSubmitting(true);
      triggerHaptic(25);
      await api.startOver(matchId, { bowlerId }, userId);
      addToast('Over Commenced', 'New over started!', 'success');
      await fetchAuthoritativeState();
    } catch (err) {
      addToast('Bowler Nomination Error', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndoDelivery = async ({ expectedDeliverySequence, reversionReason }) => {
    if (isSubmitting) return; // Prevent double-click undo

    try {
      setIsSubmitting(true);
      triggerHapticCritical();

      await offlineQueueService.enqueueUndo(matchId, match?.tournament_id, userId, {
        expectedDeliverySequence,
        reversionReason,
      });

      addToast('Undo Queued', `Reversion for ball #${expectedDeliverySequence} queued`, 'warning');
      await loadPendingMutations();
    } catch (err) {
      addToast('Undo Failed', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartInnings2 = async (openersPayload) => {
    try {
      setIsSubmitting(true);
      triggerHapticCritical();
      await api.startInnings(matchId, openersPayload, userId);
      addToast('Innings 2 Started', '2nd Innings chase is now live!', 'success');
      setShowInnings2Setup(false);
      await fetchAuthoritativeState();
    } catch (err) {
      addToast('Innings 2 Start Error', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>
        <p>Loading live match console...</p>
      </div>
    );
  }

  // Active teams context
  const currentInnings = liveState?.innings;
  const isTeamABatting = currentInnings?.batting_team_id === match?.team_a_id;
  const battingSquad = isTeamABatting ? squads?.team_a?.playing_xi : squads?.team_b?.playing_xi;
  const bowlingSquad = isTeamABatting ? squads?.team_b?.playing_xi : squads?.team_a?.playing_xi;

  const battingTeamName = isTeamABatting ? match?.team_a_name : match?.team_b_name;
  const bowlingTeamName = isTeamABatting ? match?.team_b_name : match?.team_a_name;

  // Compute pending projected score metrics (Section 2.2)
  const pendingDeliveries = pendingMutations.filter((m) => m.type === 'RECORD_DELIVERY');
  const pendingDeliveriesCount = pendingDeliveries.length;
  const pendingRuns = pendingDeliveries.reduce(
    (sum, m) => sum + (m.payload.runs_batter || 0) + (m.payload.runs_extras || 0),
    0
  );
  const pendingWickets = pendingDeliveries.filter((m) => m.payload.is_wicket).length;

  const serverRuns = currentInnings?.total_runs || 0;
  const serverWickets = currentInnings?.total_wickets || 0;
  const projectedRuns = serverRuns + pendingRuns;
  const projectedWickets = serverWickets + pendingWickets;

  return (
    <div className="container">
      <Toast toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Network and Sync Status Bar */}
      <NetworkStatusBadge matchId={matchId} userId={userId} />

      {/* Authoritative Server Score Banner */}
      <ScoreBanner match={match} liveState={liveState} />

      {/* Decoupled Projected Offline Score Indicator (Section 2.2) */}
      {pendingDeliveriesCount > 0 && (
        <div
          data-testid="projected-score-banner"
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1.5px dashed #f59e0b',
            borderRadius: '8px',
            fontSize: '0.875rem',
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          <div>
            <strong style={{ color: '#f59e0b' }}>🟡 Pending Offline:</strong> +{pendingDeliveriesCount} deliveries (
            {projectedRuns}/{projectedWickets} projected)
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)' }}>
            Official server: {serverRuns}/{serverWickets}
          </div>
        </div>
      )}

      {/* Tabs: Live Console vs Full Scorecard */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('LIVE')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'LIVE' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'LIVE' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          📱 Live Keypad
        </button>
        <button
          onClick={() => setActiveTab('SCORECARD')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'SCORECARD' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'SCORECARD' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          📊 Full Scorecard
        </button>
      </div>

      {showInnings2Setup ? (
        <OpenersSetup
          battingTeamName={bowlingTeamName}
          bowlingTeamName={battingTeamName}
          battingTeamId={currentInnings?.bowling_team_id}
          bowlingTeamId={currentInnings?.batting_team_id}
          battingSquad={bowlingSquad || []}
          bowlingSquad={battingSquad || []}
          inningsNumber={2}
          onSubmitOpeners={handleStartInnings2}
          isSubmitting={isSubmitting}
        />
      ) : activeTab === 'LIVE' ? (
        <>
          {/* Active Striker, Non-striker, and Bowler strip */}
          <PitchStrip liveState={liveState} />

          {/* Current over ball-by-ball dots & boundaries */}
          <OverBallStrip
            balls={liveState?.current_over_deliveries || []}
            currentOverNumber={liveState?.current_over?.over_number || 1}
          />

          {/* Scoring Touch Keypad with double-tap lock */}
          <ScoringKeypad
            onRecordRuns={handleRecordRuns}
            onOpenWicketModal={() => setIsWicketModalOpen(true)}
            onOpenExtrasModal={(type) => setExtrasModalConfig({ isOpen: true, type })}
            onOpenUndoModal={() => setIsUndoModalOpen(true)}
            isSubmitting={isSubmitting}
            isFreeHit={liveState?.is_free_hit}
            isOverCompleted={liveState?.current_over?.is_completed}
            isInningsCompleted={liveState?.innings?.status === 'COMPLETED'}
          />
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scorecard?.scorecards?.map((sc) => (
            <ScorecardTable key={sc.innings?.id} scorecard={sc} />
          ))}
        </div>
      )}

      {/* WICKET MODAL */}
      <WicketModal
        isOpen={isWicketModalOpen}
        onClose={() => setIsWicketModalOpen(false)}
        onSubmitWicket={handleRecordDelivery}
        liveState={liveState}
        squads={{
          batting_team: { playing_xi: battingSquad },
          bowling_team: { playing_xi: bowlingSquad },
        }}
        isFreeHit={liveState?.is_free_hit}
      />

      {/* EXTRAS MODAL */}
      <ExtrasModal
        isOpen={extrasModalConfig.isOpen}
        initialType={extrasModalConfig.type}
        onClose={() => setExtrasModalConfig({ isOpen: false, type: 'WIDE' })}
        onSubmitExtras={handleRecordDelivery}
      />

      {/* NEXT BOWLER MODAL */}
      <NextBowlerModal
        isOpen={isNextBowlerModalOpen && !showInnings2Setup}
        onClose={() => setIsNextBowlerModalOpen(false)}
        onSubmitNextBowler={handleNextBowlerSubmit}
        lastBowlerId={liveState?.bowler?.id}
        bowlingSquad={bowlingSquad || []}
        nextOverNumber={(liveState?.current_over?.over_number || 1) + 1}
      />

      {/* UNDO CONFIRM MODAL */}
      <UndoConfirmModal
        isOpen={isUndoModalOpen}
        onClose={() => setIsUndoModalOpen(false)}
        onConfirmUndo={handleUndoDelivery}
        currentSequence={liveState?.innings?.last_delivery_sequence || 0}
        isSubmitting={isSubmitting}
      />

      {/* CONFLICT RESOLUTION MODAL */}
      <ConflictResolutionModal
        isOpen={Boolean(conflictData)}
        conflictData={conflictData}
        serverMatch={match}
        pendingMutations={pendingMutations}
        matchId={matchId}
        userId={userId}
        onClose={() => setConflictData(null)}
        onResolved={() => {
          setConflictData(null);
          fetchAuthoritativeState();
        }}
      />
    </div>
  );
}
