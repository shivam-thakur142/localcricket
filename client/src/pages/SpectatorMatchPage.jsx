// ====================================================================
// SPECTATOR MATCH PAGE: REALTIME SSE BROADCAST & LIVE MATCH CENTER
// ====================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api.js';
import { ScoreBanner } from '../components/match/ScoreBanner.jsx';
import { PitchStrip } from '../components/match/PitchStrip.jsx';
import { OverBallStrip } from '../components/match/OverBallStrip.jsx';
import { ScorecardTable } from '../components/match/ScorecardTable.jsx';
import { PartnershipCard } from '../components/match/PartnershipCard.jsx';
import { MatchAnalyticsCharts } from '../components/match/MatchAnalyticsCharts.jsx';
import { CommentaryFeed } from '../components/match/CommentaryFeed.jsx';
import { MatchSummaryCard } from '../components/match/MatchSummaryCard.jsx';
import { MatchPreviewCard } from '../components/match/MatchPreviewCard.jsx';
import { PrintableScoresheet } from '../components/match/PrintableScoresheet.jsx';

export function SpectatorMatchPage({ matchId, onSelectPlayer, onSelectTeam }) {
  const [match, setMatch] = useState(null);
  const [liveState, setLiveState] = useState(null);
  const [scorecard, setScorecard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [commentary, setCommentary] = useState([]);
  const [commentaryFilter, setCommentaryFilter] = useState('all');

  const [activeTab, setActiveTab] = useState('LIVE'); // 'LIVE' | 'SCORECARD' | 'COMMENTARY'
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING'); // 'LIVE' | 'RECONNECTING' | 'FALLBACK_POLL'
  const [loading, setLoading] = useState(true);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const lastSeenSequenceRef = useRef(0);
  const eventSourceRef = useRef(null);

  // Authoritative State Fetcher & Resynchronizer
  const resynchronizeState = useCallback(async () => {
    try {
      const [mRes, liveRes, cardRes, commRes, anaRes] = await Promise.all([
        api.getMatch(matchId),
        api.getMatchLive(matchId),
        api.getMatchScorecard(matchId),
        api.getMatchCommentary(matchId, { filter: commentaryFilter }),
        api.getMatchAnalytics(matchId),
      ]);

      setMatch(mRes.data);
      setLiveState(liveRes.data);
      setScorecard(cardRes.data);
      setCommentary(commRes.data?.commentary || []);
      setAnalytics(anaRes.data);

      lastSeenSequenceRef.current = liveRes.data?.latest_delivery_sequence || 0;
    } catch (err) {
      console.error('Failed to resynchronize spectator state:', err);
    } finally {
      setLoading(false);
    }
  }, [matchId, commentaryFilter]);

  // Commentary refetch when filter changes
  useEffect(() => {
    api.getMatchCommentary(matchId, { filter: commentaryFilter })
      .then((res) => setCommentary(res.data?.commentary || []))
      .catch((err) => console.error('Error fetching filtered commentary:', err));
  }, [matchId, commentaryFilter]);

  // Realtime Server-Sent Events (SSE) Lifecycle & Reconnection
  useEffect(() => {
    let fallbackTimer = null;
    let isCancelled = false;

    const setupSSE = () => {
      if (typeof window === 'undefined' || !window.EventSource) {
        setConnectionStatus('FALLBACK_POLL');
        fallbackTimer = setInterval(resynchronizeState, 10000);
        return;
      }

      setConnectionStatus('CONNECTING');
      const streamUrl = api.getMatchStreamUrl(matchId);
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      // 1. Initial Snapshot Event (Sent immediately upon connection)
      es.addEventListener('initial_snapshot', (e) => {
        if (isCancelled) return;
        try {
          const payload = JSON.parse(e.data);
          if (payload.liveState) {
            setLiveState(payload.liveState);
            lastSeenSequenceRef.current = payload.deliverySequence || 0;
          }
          setConnectionStatus('LIVE');
          // Fetch complete initial scorecard and analytics
          api.getMatch(matchId).then((r) => setMatch(r.data));
          api.getMatchScorecard(matchId).then((r) => setScorecard(r.data));
          api.getMatchAnalytics(matchId).then((r) => setAnalytics(r.data));
          api.getMatchCommentary(matchId, { filter: commentaryFilter }).then((r) => setCommentary(r.data?.commentary || []));
          setLoading(false);
        } catch (err) {
          console.error('Error parsing initial_snapshot:', err);
        }
      });

      // 2. Incremental Match Update Event
      es.addEventListener('match_update', (e) => {
        if (isCancelled) return;
        try {
          const payload = JSON.parse(e.data);
          if (payload.liveState) {
            setLiveState(payload.liveState);
            lastSeenSequenceRef.current = payload.deliverySequence || 0;
          }
          setConnectionStatus('LIVE');

          // Asynchronously update scorecard, analytics, commentary
          api.getMatchScorecard(matchId).then((r) => setScorecard(r.data));
          api.getMatchAnalytics(matchId).then((r) => setAnalytics(r.data));
          api.getMatchCommentary(matchId, { filter: commentaryFilter }).then((r) => setCommentary(r.data?.commentary || []));
        } catch (err) {
          console.error('Error parsing match_update:', err);
        }
      });

      // 3. Heartbeat ping
      es.addEventListener('ping', () => {
        if (isCancelled) return;
        setConnectionStatus('LIVE');
      });

      // 4. Connection Drop & Reconnection Protocol
      es.onerror = () => {
        if (isCancelled) return;
        setConnectionStatus('RECONNECTING');

        // On drop, perform immediate resynchronization to prevent missed events
        resynchronizeState();
      };
    };

    // Initial load
    resynchronizeState();
    setupSSE();

    return () => {
      isCancelled = true;
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [matchId, resynchronizeState]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '40px' }}>
        <p>Connecting to live match stream...</p>
      </div>
    );
  }

  const targetCtx = liveState?.target_context;

  return (
    <div className="container">
      {/* Live Stream Status Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {connectionStatus === 'LIVE' && (
            <>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              <span style={{ color: '#10b981', fontWeight: 700 }}>LIVE BROADCAST (SSE)</span>
            </>
          )}
          {connectionStatus === 'RECONNECTING' && (
            <>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              <span style={{ color: '#f59e0b', fontWeight: 700 }}>RECONNECTING & RESYNCING...</span>
            </>
          )}
          {connectionStatus === 'FALLBACK_POLL' && (
            <>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748b', display: 'inline-block' }} />
              <span style={{ color: '#94a3b8', fontWeight: 700 }}>POLLING (FALLBACK)</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsExportOpen(true)}
            style={{
              background: '#047857',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            🖨️ Official Scoresheet
          </button>
          <button
            onClick={resynchronizeState}
            style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
          >
            🔄 Resync State
          </button>
        </div>
      </div>

      {/* Target / Chase Context Banner */}
      {targetCtx && (
        <div
          style={{
            background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid #38bdf8',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Target: </span>
            <strong style={{ color: '#f8fafc', fontSize: '1rem' }}>{targetCtx.target}</strong>
            <span style={{ margin: '0 8px', color: '#475569' }}>|</span>
            <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 700 }}>
              Need {targetCtx.runs_needed} runs from {targetCtx.balls_remaining} balls
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Req. RR: <strong style={{ color: '#f59e0b' }}>{targetCtx.required_run_rate}</strong>
          </div>
        </div>
      )}

      {/* Score Banner */}
      <ScoreBanner match={match} liveState={liveState} />

      {/* Match Preview & Intelligence Card */}
      <div style={{ marginBottom: '14px' }}>
        <MatchPreviewCard matchId={matchId} />
      </div>

      {/* Active Partnership Card */}
      <PartnershipCard
        activePartnership={liveState?.current_partnership}
        historicalPartnerships={analytics?.innings?.find((i) => i.innings_id === liveState?.innings?.id)?.historical_partnerships || []}
      />

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
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
          ● Live & Charts
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
        <button
          onClick={() => setActiveTab('COMMENTARY')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'COMMENTARY' ? '#0284c7' : 'var(--bg-accent)',
            color: activeTab === 'COMMENTARY' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          🎙️ Commentary
        </button>
      </div>

      {/* TAB 1: LIVE OVERVIEW & CHARTS */}
      {activeTab === 'LIVE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <PitchStrip liveState={liveState} />
          <OverBallStrip
            balls={liveState?.recent_deliveries || []}
            currentOverNumber={liveState?.innings?.overs_completed ? Math.floor(parseFloat(liveState.innings.overs_completed)) + 1 : 1}
          />
          <MatchAnalyticsCharts analytics={analytics} />
        </div>
      )}

      {/* TAB 2: BROADCAST SCORECARD */}
      {activeTab === 'SCORECARD' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <MatchSummaryCard
            match={match || scorecard?.match}
            onSelectPlayer={onSelectPlayer}
            onSelectTeam={onSelectTeam}
          />
          {scorecard?.scorecards && scorecard.scorecards.length > 0 ? (
            <ScorecardTable
              scorecards={scorecard.scorecards}
              onSelectPlayer={onSelectPlayer}
              onSelectTeam={onSelectTeam}
            />
          ) : (
            scorecard?.scorecards?.map((sc) => (
              <ScorecardTable
                key={sc.innings?.id}
                scorecard={sc}
                onSelectPlayer={onSelectPlayer}
                onSelectTeam={onSelectTeam}
              />
            ))
          )}
        </div>
      )}

      {/* TAB 3: FILTERABLE COMMENTARY FEED */}
      {activeTab === 'COMMENTARY' && (
        <CommentaryFeed
          commentary={commentary}
          activeFilter={commentaryFilter}
          onFilterChange={setCommentaryFilter}
        />
      )}

      {/* OFFICIAL PRINTABLE SCORESHEET MODAL */}
      {isExportOpen && (
        <PrintableScoresheet
          matchId={matchId}
          onClose={() => setIsExportOpen(false)}
        />
      )}
    </div>
  );
}
