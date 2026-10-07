import React from 'react';
import { PlayoffMatchCard } from './PlayoffMatchCard.jsx';
import { ChampionPodium } from './ChampionPodium.jsx';

export function PlayoffBracket({ playoffData, onSelectMatch, onOpenGenerateModal, canManage = false }) {
  if (!playoffData || playoffData.playoff_format === 'NONE' || !playoffData.matches || playoffData.matches.length === 0) {
    return (
      <div
        className="card"
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          background: '#0f172a',
          border: '1px dashed #334155',
          borderRadius: '12px',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎯</div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>
          Playoff Bracket Not Yet Generated
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 20px auto' }}>
          Once the regular season league stage concludes, the tournament organizer can seed the top teams into the
          playoff knockout bracket.
        </p>
        {canManage && onOpenGenerateModal && (
          <button
            onClick={onOpenGenerateModal}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ⚡ Generate Playoff Bracket
          </button>
        )}
      </div>
    );
  }

  const { playoff_format, matches, champion, runner_up, tournament_name } = playoffData;

  // Filter matches by stage
  const q1Match = matches.find((m) => m.stage === 'QUALIFIER_1');
  const elMatch = matches.find((m) => m.stage === 'ELIMINATOR');
  const q2Match = matches.find((m) => m.stage === 'QUALIFIER_2');
  const sf1Match = matches.find((m) => m.stage === 'SEMI_FINAL_1');
  const sf2Match = matches.find((m) => m.stage === 'SEMI_FINAL_2');
  const finalMatch = matches.find((m) => m.stage === 'FINAL');

  return (
    <div>
      {/* Champion Podium if tournament completed */}
      {champion && (
        <ChampionPodium champion={champion} runnerUp={runner_up} tournamentName={tournament_name} />
      )}

      {/* Bracket Tree Container */}
      <div style={{ overflowX: 'auto', paddingBottom: '16px' }}>
        {playoff_format === 'PAGE_PLAYOFF' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(280px, 1fr))',
              gap: '24px',
              alignItems: 'center',
            }}
          >
            {/* Column 1: Qualifiers & Eliminator */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Qualifier 1 (Rank 1 vs 2)
                </h4>
                <PlayoffMatchCard
                  match={q1Match}
                  stageName="Qualifier 1"
                  onSelectMatch={onSelectMatch}
                />
              </div>

              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Eliminator (Rank 3 vs 4)
                </h4>
                <PlayoffMatchCard
                  match={elMatch}
                  stageName="Eliminator"
                  onSelectMatch={onSelectMatch}
                />
              </div>
            </div>

            {/* Column 2: Qualifier 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h4 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>
                Qualifier 2 (Loser Q1 vs Winner Eliminator)
              </h4>
              <PlayoffMatchCard
                match={q2Match}
                stageName="Qualifier 2"
                onSelectMatch={onSelectMatch}
              />
            </div>

            {/* Column 3: Grand Final */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h4 style={{ fontSize: '0.85rem', color: '#fbbf24', marginBottom: '8px', textTransform: 'uppercase' }}>
                🏆 Grand Final (Winner Q1 vs Winner Q2)
              </h4>
              <PlayoffMatchCard
                match={finalMatch}
                stageName="Grand Final"
                onSelectMatch={onSelectMatch}
              />
            </div>
          </div>
        )}

        {playoff_format === 'SEMI_FINALS' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(300px, 1fr))',
              gap: '32px',
              alignItems: 'center',
            }}
          >
            {/* Column 1: Semi-Finals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Semi-Final 1 (Rank 1 vs 4)
                </h4>
                <PlayoffMatchCard
                  match={sf1Match}
                  stageName="Semi-Final 1"
                  onSelectMatch={onSelectMatch}
                />
              </div>

              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Semi-Final 2 (Rank 2 vs 3)
                </h4>
                <PlayoffMatchCard
                  match={sf2Match}
                  stageName="Semi-Final 2"
                  onSelectMatch={onSelectMatch}
                />
              </div>
            </div>

            {/* Column 2: Grand Final */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h4 style={{ fontSize: '0.85rem', color: '#fbbf24', marginBottom: '8px', textTransform: 'uppercase' }}>
                🏆 Grand Final (Winner SF1 vs Winner SF2)
              </h4>
              <PlayoffMatchCard
                match={finalMatch}
                stageName="Grand Final"
                onSelectMatch={onSelectMatch}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
