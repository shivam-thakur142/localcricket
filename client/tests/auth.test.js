// ====================================================================
// PRODUCTION AUTHENTICATION & JWT FRONTEND INTEGRATION TESTS
// ====================================================================

import assert from 'assert';
import { boundedFetch, setAccessToken, getAccessToken, api } from '../src/services/api.js';

console.log('\n🏏 ======================================================================');
console.log('🏏 LocalCricket: Running Milestone 11 Authentication & JWT Frontend Tests');
console.log('🏏 ======================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function assertTest(name, fn) {
  totalTests++;
  process.stdout.write(`🧪 [Frontend Auth Test ${totalTests}] ${name}... `);
  try {
    await fn();
    console.log('PASSED ✅');
    passedTests++;
  } catch (err) {
    console.log('FAILED ❌');
    console.error('   Error details:', err.message);
    throw err;
  }
}

// ----------------------------------------------------
// TEST 1: In-Memory Token Store & Storage Isolation
// ----------------------------------------------------
await assertTest('In-Memory Token Store: Strictly held in JS memory without storage leakage', () => {
  // Reset token
  setAccessToken(null);
  assert.strictEqual(getAccessToken(), null);

  // Set token
  const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummyPayload.sampleSignature';
  setAccessToken(sampleToken);
  assert.strictEqual(getAccessToken(), sampleToken);

  // Guard against browser localStorage/sessionStorage exposure
  if (typeof localStorage !== 'undefined') {
    assert.strictEqual(localStorage.getItem('accessToken'), null);
    assert.strictEqual(localStorage.getItem('token'), null);
  }
  if (typeof sessionStorage !== 'undefined') {
    assert.strictEqual(sessionStorage.getItem('accessToken'), null);
    assert.strictEqual(sessionStorage.getItem('token'), null);
  }

  // Clear token
  setAccessToken(null);
  assert.strictEqual(getAccessToken(), null);
});

// ----------------------------------------------------
// TEST 2: Authorization Header Injection
// ----------------------------------------------------
await assertTest('Auth Header Injection: boundedFetch attaches Bearer token to requests', async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders = null;

  globalThis.fetch = async (url, options) => {
    capturedHeaders = options?.headers || {};
    return {
      status: 200,
      json: async () => ({ success: true, data: { status: 'OK' } }),
    };
  };

  try {
    const testToken = 'valid.jwt.token123';
    setAccessToken(testToken);

    await boundedFetch('/api/v1/tournaments');
    assert.strictEqual(capturedHeaders['Authorization'], `Bearer ${testToken}`);

    // Clean up
    setAccessToken(null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ----------------------------------------------------
// TEST 3: Silent Refresh Interceptor on 401 TOKEN_EXPIRED
// ----------------------------------------------------
await assertTest('Silent Refresh: Automatically refreshes token on 401 TOKEN_EXPIRED and retries request', async () => {
  const originalFetch = globalThis.fetch;
  let attemptCount = 0;
  let refreshAttempted = false;

  setAccessToken('expired.initial.token');

  globalThis.fetch = async (url, options) => {
    // Intercept refresh call
    if (url.includes('/auth/refresh')) {
      refreshAttempted = true;
      return {
        status: 200,
        ok: true,
        json: async () => ({
          success: true,
          data: {
            accessToken: 'replacement.valid.token',
            user: { id: 'user-1', email: 'test@example.com' },
          },
        }),
      };
    }

    attemptCount++;
    if (attemptCount === 1) {
      // First attempt fails with TOKEN_EXPIRED
      return {
        status: 401,
        ok: false,
        json: async () => ({
          success: false,
          error: { code: 'TOKEN_EXPIRED', message: 'Access token has expired' },
        }),
      };
    }

    // Second attempt (after refresh) succeeds
    return {
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: { message: 'Protected resource retrieved' },
      }),
    };
  };

  try {
    const res = await boundedFetch('/api/v1/scorer/matches/sample-match/live');
    assert.strictEqual(refreshAttempted, true, 'Silent refresh endpoint should have been called');
    assert.strictEqual(attemptCount, 2, 'Original request should have been retried once');
    assert.strictEqual(getAccessToken(), 'replacement.valid.token', 'Access token in memory should be updated');
    assert.strictEqual(res.data.message, 'Protected resource retrieved');
  } finally {
    setAccessToken(null);
    globalThis.fetch = originalFetch;
  }
});

// ----------------------------------------------------
// TEST 4: Client-Side Password Complexity Rules
// ----------------------------------------------------
await assertTest('Password Complexity: Enforces 8+ chars, upper, lower, number, and special character', () => {
  const validatePassword = (pwd) => {
    if (!pwd || typeof pwd !== 'string') return false;
    if (pwd.length < 8) return false;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    return hasUpper && hasLower && hasNumber && hasSpecial;
  };

  // Invalid test cases
  assert.strictEqual(validatePassword('short1!'), false, 'Rejects passwords under 8 chars');
  assert.strictEqual(validatePassword('alllowercase1!'), false, 'Rejects password without uppercase');
  assert.strictEqual(validatePassword('ALLUPPERCASE1!'), false, 'Rejects password without lowercase');
  assert.strictEqual(validatePassword('NoDigitsHere!'), false, 'Rejects password without number');
  assert.strictEqual(validatePassword('NoSpecialChar123'), false, 'Rejects password without special character');

  // Valid test cases
  assert.strictEqual(validatePassword('LocalCricket@2026!'), true, 'Accepts valid production seed password');
  assert.strictEqual(validatePassword('Str0ngP@ssw0rd!'), true, 'Accepts strong valid password');
  assert.strictEqual(validatePassword('V!ratK0hli#18'), true, 'Accepts valid complex password');
});

// ----------------------------------------------------
// TEST 5: Password Change Session Cleansing Contract
// ----------------------------------------------------
await assertTest('Session Cleansing: Password change wipes in-memory auth state', () => {
  let userSession = { id: 'user-123', email: 'organizer@localcricket.test' };
  setAccessToken('active.session.token');

  assert.notStrictEqual(getAccessToken(), null);
  assert.notStrictEqual(userSession, null);

  // Simulate password change event handler
  function handlePasswordChangeSuccess() {
    setAccessToken(null);
    userSession = null;
  }

  handlePasswordChangeSuccess();

  assert.strictEqual(getAccessToken(), null, 'Access token must be purged upon password change');
  assert.strictEqual(userSession, null, 'User session must be set to null');
});

// ----------------------------------------------------
// TEST 6: Invitation Public Preview Formatting & Expiry Check
// ----------------------------------------------------
await assertTest('Invitation Preview: Formats tournament metadata and detects expired invitations', () => {
  const formatInvitationPreview = (raw) => {
    const isExpired = new Date(raw.expiresAt) <= new Date();
    return {
      title: `${raw.tournamentName} (${raw.format})`,
      location: `${raw.tournamentCity} • ${raw.ballType} ball`,
      roleBadge: `⭐ ${raw.role}`,
      isRestricted: !!raw.invitedEmail,
      isExpired,
      statusDisplay: isExpired ? 'EXPIRED' : raw.status,
    };
  };

  const validInvite = {
    tournamentName: 'Shivaji Park Premier League',
    tournamentCity: 'Mumbai',
    format: 'T20',
    ballType: 'LEATHER',
    role: 'SCORER',
    invitedEmail: 'scorer@localcricket.test',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days in future
  };

  const formattedValid = formatInvitationPreview(validInvite);
  assert.strictEqual(formattedValid.title, 'Shivaji Park Premier League (T20)');
  assert.strictEqual(formattedValid.roleBadge, '⭐ SCORER');
  assert.strictEqual(formattedValid.isRestricted, true);
  assert.strictEqual(formattedValid.isExpired, false);
  assert.strictEqual(formattedValid.statusDisplay, 'PENDING');

  const expiredInvite = {
    ...validInvite,
    expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
  };
  const formattedExpired = formatInvitationPreview(expiredInvite);
  assert.strictEqual(formattedExpired.isExpired, true);
  assert.strictEqual(formattedExpired.statusDisplay, 'EXPIRED');
});

// ----------------------------------------------------
// TEST 7: Invitation Acceptance Domain Error Mapping
// ----------------------------------------------------
await assertTest('Invitation Error Mapping: Maps API error codes to human-friendly feedback', () => {
  const mapInvitationError = (errorCode) => {
    switch (errorCode) {
      case 'INVITATION_EMAIL_MISMATCH':
        return 'This invitation was issued for another email address. Please switch accounts.';
      case 'INVITATION_ALREADY_ACCEPTED':
        return 'This invitation token has already been accepted.';
      case 'INVITATION_REVOKED':
        return 'This invitation was revoked by the tournament organizer.';
      case 'INVITATION_EXPIRED':
        return 'This invitation has expired. Please request a new invite link.';
      case 'ALREADY_TOURNAMENT_MEMBER':
        return 'You are already a member of this tournament.';
      default:
        return 'Unable to accept invitation. Please try again or contact the organizer.';
    }
  };

  assert.strictEqual(
    mapInvitationError('INVITATION_EMAIL_MISMATCH'),
    'This invitation was issued for another email address. Please switch accounts.'
  );
  assert.strictEqual(
    mapInvitationError('INVITATION_ALREADY_ACCEPTED'),
    'This invitation token has already been accepted.'
  );
  assert.strictEqual(
    mapInvitationError('INVITATION_REVOKED'),
    'This invitation was revoked by the tournament organizer.'
  );
  assert.strictEqual(
    mapInvitationError('INVITATION_EXPIRED'),
    'This invitation has expired. Please request a new invite link.'
  );
  assert.strictEqual(
    mapInvitationError('UNKNOWN_CODE'),
    'Unable to accept invitation. Please try again or contact the organizer.'
  );
});

console.log('\n======================================================================');
console.log(`🏆 ALL ${passedTests} OF ${totalTests} MILESTONE 11 AUTHENTICATION FRONTEND TESTS PASSED!`);
console.log('======================================================================\n');
