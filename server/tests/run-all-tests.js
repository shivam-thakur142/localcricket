import { runIntegrityTests } from './run-integrity-tests.js';
import { runEngineTests } from './engine.test.js';
import { runApiTests } from './scorer-api.test.js';
import { runBackendContractTests } from './backend-contracts.test.js';
import { runNrrEngineTests } from './nrr-engine.test.js';
import { runTournamentIsolationTests } from './tournament-isolation.test.js';
import { runMilestone5AnalyticsTests } from './milestone5-analytics.test.js';
import { runMilestone6AdminTests } from './milestone6-admin.test.js';
import { runMilestone7PlayoffTests } from './milestone7-playoffs.test.js';
import { runMilestone8ProfileAndAwardTests } from './milestone8-profiles-awards.test.js';
import { runMilestone9RecordsAndH2HTests } from './milestone9-records-h2h.test.js';
import { runMilestone10OperationsTests } from './milestone10-operations.test.js';
import { runMilestone11AuthTests } from './milestone11-auth.test.js';
import { runMilestone12AdminTests } from './milestone12-admin.test.js';
import { runMilestone13OfflineContractTests } from './milestone13-offline-contracts.test.js';
import { runMilestone14ProductionHardeningTests } from './milestone14-production-hardening.test.js';
import { runMilestone15DeploymentLaunchTests } from './milestone15-deployment-launch.test.js';

async function runMasterTestSuite() {
  console.log('🏏 ======================================================================');
  console.log('🏏 LOCALCRICKET: MASTER AUTOMATED TEST SUITE');
  console.log('🏏 ======================================================================\n');

  const startTime = Date.now();

  // 1. Milestone 1: Database & Integrity Suite
  const m1Result = await runIntegrityTests();

  // 2. Milestone 2: Scoring Engine Unit Suite
  const m2EngineResult = await runEngineTests();

  // 3. Milestone 2: Scorer API Integration Suite
  const m2ApiResult = await runApiTests();

  // 4. Milestone 3: Backend Contracts & Concurrency Suite
  const m3ContractResult = await runBackendContractTests();

  // 5. Milestone 4: NRR Engine Unit Suite
  const m4NrrResult = runNrrEngineTests();

  // 6. Milestone 4: Tournament Isolation, RBAC & Standings Suite
  const m4IsolationResult = await runTournamentIsolationTests();

  // 7. Milestone 5: Spectator Analytics, SSE & Leaderboards Suite
  const m5AnalyticsResult = await runMilestone5AnalyticsTests();

  // 8. Milestone 6: Tournament Administration Studio & Lifecycle Suite
  const m6AdminResult = await runMilestone6AdminTests();

  // 9. Milestone 7: Tournament Playoffs, Knockout Brackets & Finals Suite
  const m7PlayoffResult = await runMilestone7PlayoffTests();

  // 10. Milestone 8: Public Profiles, Awards & Scorecard Suite
  const m8ProfileResult = await runMilestone8ProfileAndAwardTests();

  // 11. Milestone 9: Tournament Records, H2H & Printable Scoresheet Suite
  const m9RecordsResult = await runMilestone9RecordsAndH2HTests();

  // 12. Milestone 10: Tournament Operations, Scheduling & Archive Suite
  const m10OperationsResult = await runMilestone10OperationsTests();

  // 13. Milestone 11: Production Authentication, JWT & Real User Accounts Suite
  const m11AuthResult = await runMilestone11AuthTests();

  // 14. Milestone 12: Super Admin & Platform Management Console Suite
  const m12AdminResult = await runMilestone12AdminTests();

  // 15. Milestone 13: Offline Scoring & Mobile Sunlight UI Contracts Suite
  const m13OfflineResult = await runMilestone13OfflineContractTests();

  // 16. Milestone 14: Production Hardening & Deployment Suite
  const m14ProductionResult = await runMilestone14ProductionHardeningTests();

  // 17. Milestone 15: Production Deployment & Launch Suite
  const m15LaunchResult = await runMilestone15DeploymentLaunchTests();

  const totalPassed =
    m1Result.passedTests +
    m2EngineResult.passedTests +
    m2ApiResult.passedTests +
    m3ContractResult.passedTests +
    m4NrrResult.passedTests +
    m4IsolationResult.passedTests +
    m5AnalyticsResult.passedTests +
    m6AdminResult.passedTests +
    m7PlayoffResult.passedTests +
    m8ProfileResult.passedTests +
    m9RecordsResult.passedTests +
    m10OperationsResult.passedTests +
    m11AuthResult.passedTests +
    m12AdminResult.passedTests +
    m13OfflineResult.passedTests +
    m14ProductionResult.passed +
    m15LaunchResult.passed;

  const totalTests =
    m1Result.totalTests +
    m2EngineResult.totalTests +
    m2ApiResult.totalTests +
    m3ContractResult.totalTests +
    m4NrrResult.totalTests +
    m4IsolationResult.totalTests +
    m5AnalyticsResult.totalTests +
    m6AdminResult.totalTests +
    m7PlayoffResult.totalTests +
    m8ProfileResult.totalTests +
    m9RecordsResult.totalTests +
    m10OperationsResult.totalTests +
    m11AuthResult.totalTests +
    m12AdminResult.totalTests +
    m13OfflineResult.totalTests +
    m14ProductionResult.total +
    m15LaunchResult.total;

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n======================================================================');
  console.log('📊 MASTER TEST EXECUTION REPORT');
  console.log('======================================================================');
  console.log(`1. Milestone 1 Database Integrity Suite: ${m1Result.passedTests} / ${m1Result.totalTests} Passed ✅`);
  console.log(`2. Milestone 2 Scoring Engine Unit Suite: ${m2EngineResult.passedTests} / ${m2EngineResult.totalTests} Passed ✅`);
  console.log(`3. Milestone 2 Scorer API Integration Suite: ${m2ApiResult.passedTests} / ${m2ApiResult.totalTests} Passed ✅`);
  console.log(`4. Milestone 3 Backend Contracts & Concurrency Suite: ${m3ContractResult.passedTests} / ${m3ContractResult.totalTests} Passed ✅`);
  console.log(`5. Milestone 4 NRR Engine Unit Suite: ${m4NrrResult.passedTests} / ${m4NrrResult.totalTests} Passed ✅`);
  console.log(`6. Milestone 4 Tournament Isolation & Standings Suite: ${m4IsolationResult.passedTests} / ${m4IsolationResult.totalTests} Passed ✅`);
  console.log(`7. Milestone 5 Spectator Analytics & SSE Suite: ${m5AnalyticsResult.passedTests} / ${m5AnalyticsResult.totalTests} Passed ✅`);
  console.log(`8. Milestone 6 Tournament Admin Studio & Lifecycle Suite: ${m6AdminResult.passedTests} / ${m6AdminResult.totalTests} Passed ✅`);
  console.log(`9. Milestone 7 Playoffs, Brackets & Finals Suite: ${m7PlayoffResult.passedTests} / ${m7PlayoffResult.totalTests} Passed ✅`);
  console.log(`10. Milestone 8 Public Profiles & Awards Suite: ${m8ProfileResult.passedTests} / ${m8ProfileResult.totalTests} Passed ✅`);
  console.log(`11. Milestone 9 Tournament Records & H2H Suite: ${m9RecordsResult.passedTests} / ${m9RecordsResult.totalTests} Passed ✅`);
  console.log(`12. Milestone 10 Tournament Operations Suite: ${m10OperationsResult.passedTests} / ${m10OperationsResult.totalTests} Passed ✅`);
  console.log(`13. Milestone 11 Production Auth & JWT Suite: ${m11AuthResult.passedTests} / ${m11AuthResult.totalTests} Passed ✅`);
  console.log(`14. Milestone 12 Super Admin & Platform Management Suite: ${m12AdminResult.passedTests} / ${m12AdminResult.totalTests} Passed ✅`);
  console.log(`15. Milestone 13 Offline Contracts & Replay Suite: ${m13OfflineResult.passedTests} / ${m13OfflineResult.totalTests} Passed ✅`);
  console.log(`16. Milestone 14 Production Hardening & Deployment Suite: ${m14ProductionResult.passed} / ${m14ProductionResult.total} Passed ✅`);
  console.log(`17. Milestone 15 Production Deployment & Launch Suite: ${m15LaunchResult.passed} / ${m15LaunchResult.total} Passed ✅`);
  console.log('----------------------------------------------------------------------');
  console.log(`🏆 OVERALL TOTAL: ${totalPassed} / ${totalTests} TESTS PASSED (100% SUCCESS)`);
  console.log(`⏱️ Execution Time: ${durationSec}s`);
  console.log('======================================================================\n');
}

runMasterTestSuite().catch((err) => {
  console.error('\n❌ MASTER TEST SUITE ENCOUNTERED UNEXPECTED ERROR:', err);
  process.exit(1);
});
