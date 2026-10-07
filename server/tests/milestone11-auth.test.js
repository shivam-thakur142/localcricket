// ====================================================================
// MILESTONE 11: PRODUCTION AUTHENTICATION, JWT & REAL USER ACCOUNTS TESTS
// ====================================================================

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import {
  validateJwtSecretConfig,
  generateAccessToken,
  getJwtSecret,
} from '../src/services/tokenService.js';
import { resetRateLimits } from '../src/services/authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMilestone11AuthTests() {
  console.log('\n🏏 ======================================================================');
  console.log('🏏 LocalCricket: Running Milestone 11 Production Auth & JWT Tests');
  console.log('🏏 ======================================================================\n');

  // Ensure test mode with rate limit disabled by default
  process.env.NODE_ENV = 'test';
  process.env.RATE_LIMIT_DISABLED = 'true';
  resetRateLimits();

  const db = new PGlite();

  // Run all migrations 001 through 013
  const migrationFiles = [
    '001_initial_schema.sql',
    '002_triggers_and_integrity.sql',
    '003_rls_policies.sql',
    '004_seed_test_data.sql',
    '005_idempotency_keys.sql',
    '006_tournament_points_config.sql',
    '007_spectator_analytics_indexes.sql',
    '008_tournament_admin_enhancements.sql',
    '009_tournament_playoffs_and_brackets.sql',
    '010_player_team_profile_indexes.sql',
    '011_records_and_h2h_indexes.sql',
    '012_tournament_operations_and_officials.sql',
    '013_production_authentication_and_jwt.sql',
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(__dirname, '..', 'migrations', file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    await db.exec(sql);
  }

  const app = createApp(db);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const request = (pathStr, options = {}) => {
    return new Promise((resolve, reject) => {
      const url = new URL(pathStr, baseUrl);
      const headers = { ...(options.headers || {}) };
      let bodyPayload = null;
      if (options.body) {
        bodyPayload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyPayload);
      }
      const reqOptions = {
        method: options.method || 'GET',
        headers,
      };
      const req = http.request(url, reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      });
      req.on('error', reject);
      if (bodyPayload) {
        req.write(bodyPayload);
      }
      req.end();
    });
  };

  const extractCookie = (res, cookieName) => {
    const setCookie = res.headers['set-cookie'];
    if (!setCookie) return null;
    const cookieArr = Array.isArray(setCookie) ? setCookie : [setCookie];
    const match = cookieArr.find((c) => c.startsWith(`${cookieName}=`));
    if (!match) return null;
    return match.split(';')[0].split('=')[1];
  };

  const getErrorCode = (res) => res.data?.error?.code || res.data?.errorCode;

  let passedTests = 0;
  let totalTests = 0;

  const test = async (name, fn) => {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  ✅ Test ${totalTests}: ${name}`);
    } catch (err) {
      console.error(`  ❌ Test ${totalTests} FAILED: ${name}`);
      console.error(err);
      throw err;
    }
  };

  // Shared state across tests
  let rohitAccessToken = null;
  let rohitRefreshToken = null;
  let testInviteToken = null;

  try {
    // ----------------------------------------------------
    // 1. REGISTRATION & PASSWORD VALIDATION
    // ----------------------------------------------------
    await test('User Registration Success (bcrypt cost 12, user_credentials, tokens)', async () => {
      const res = await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Rohit Sharma',
          email: 'rohit@cricket.test',
          password: 'Password@2026!',
          phone: '+919876543299',
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.user.email, 'rohit@cricket.test');
      assert.ok(typeof res.data.data.accessToken === 'string');
      assert.ok(res.data.data.accessToken.length > 20);

      const refreshCookie = extractCookie(res, 'refreshToken');
      assert.ok(refreshCookie, 'Expected refreshToken cookie to be set');

      // Verify stored credentials in database
      const credRes = await db.query(
        'SELECT password_hash FROM user_credentials WHERE user_id = $1',
        [res.data.data.user.id]
      );
      assert.strictEqual(credRes.rows.length, 1);
      assert.ok(credRes.rows[0].password_hash.startsWith('$2b$12$'));
      assert.strictEqual(
        bcrypt.compareSync('Password@2026!', credRes.rows[0].password_hash),
        true
      );

      rohitAccessToken = res.data.data.accessToken;
      rohitRefreshToken = refreshCookie;
    });

    await test('Registration Weak Password Rejection: Missing Uppercase (400)', async () => {
      const res = await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Weak User',
          email: 'weak1@cricket.test',
          password: 'password@123',
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(getErrorCode(res), 'PASSWORD_NO_UPPERCASE');
    });

    await test('Registration Weak Password Rejection: Missing Digit or Symbol (400)', async () => {
      const res = await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Weak User 2',
          email: 'weak2@cricket.test',
          password: 'PasswordOnlyNoSymbols',
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.success, false);
    });

    await test('Registration Weak Password Rejection: Shorter Than 8 Characters (400)', async () => {
      const res = await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Short User',
          email: 'short@cricket.test',
          password: 'Pass1!',
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(getErrorCode(res), 'PASSWORD_TOO_SHORT');
    });

    await test('Registration Duplicate Email Rejection (Case-Insensitive) (409)', async () => {
      const res = await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Rohit Duplicate',
          email: 'ROHIT@cricket.test',
          password: 'Password@2026!',
        },
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(getErrorCode(res), 'EMAIL_ALREADY_EXISTS');
    });

    // ----------------------------------------------------
    // 2. LOGIN & BRUTE-FORCE LOCKOUT
    // ----------------------------------------------------
    await test('User Login Success (Valid credentials)', async () => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: {
          email: 'rohit@cricket.test',
          password: 'Password@2026!',
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.user.email, 'rohit@cricket.test');
      assert.ok(res.data.data.accessToken);

      const cookie = extractCookie(res, 'refreshToken');
      assert.ok(cookie);
      rohitAccessToken = res.data.data.accessToken;
      rohitRefreshToken = cookie;
    });

    await test('Login Incorrect Password Rejection (401)', async () => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: {
          email: 'rohit@cricket.test',
          password: 'WrongPassword@123',
        },
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(getErrorCode(res), 'INVALID_CREDENTIALS');
    });

    await test('Login Unregistered Email Rejection (401)', async () => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: {
          email: 'unknown-player@cricket.test',
          password: 'Password@2026!',
        },
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(getErrorCode(res), 'INVALID_CREDENTIALS');
    });

    await test('Brute-Force Account Lockout after 5 Consecutive Failures (401)', async () => {
      // Register dedicated lockout test user
      await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Lockout Target',
          email: 'lockout@cricket.test',
          password: 'ValidPassword@123!',
        },
      });

      // 4 failed attempts
      for (let i = 0; i < 4; i++) {
        const failRes = await request('/api/v1/auth/login', {
          method: 'POST',
          body: { email: 'lockout@cricket.test', password: 'WrongPassword@123' },
        });
        assert.strictEqual(failRes.status, 401);
      }

      // 5th failed attempt triggers 15-minute lockout
      const fifthRes = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'lockout@cricket.test', password: 'WrongPassword@123' },
      });
      assert.strictEqual(fifthRes.status, 401);
      assert.strictEqual(getErrorCode(fifthRes), 'ACCOUNT_TEMPORARILY_LOCKED');

      // 6th attempt with CORRECT password is still locked out
      const sixthRes = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'lockout@cricket.test', password: 'ValidPassword@123!' },
      });
      assert.strictEqual(sixthRes.status, 401);
      assert.strictEqual(getErrorCode(sixthRes), 'ACCOUNT_TEMPORARILY_LOCKED');
    });

    // ----------------------------------------------------
    // 3. STATELESS ACCESS TOKEN AUTHENTICATION & INTEGRITY
    // ----------------------------------------------------
    await test('Stateless Access Token Authentication (/api/v1/auth/me)', async () => {
      const res = await request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${rohitAccessToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.email, 'rohit@cricket.test');
    });

    await test('Expired Access Token Rejection (401 TOKEN_EXPIRED)', async () => {
      const secret = getJwtSecret();
      const expiredToken = jwt.sign(
        { sub: '11111111-1111-1111-1111-111111111111', email: 'test@exp.com' },
        secret,
        { expiresIn: -10, algorithm: 'HS256' }
      );

      const res = await request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(getErrorCode(res), 'TOKEN_EXPIRED');
    });

    await test('Tampered Access Token Rejection (401 TOKEN_INVALID)', async () => {
      const tampered = rohitAccessToken.slice(0, -6) + 'abcdef';
      const res = await request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${tampered}` },
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(getErrorCode(res), 'TOKEN_INVALID');
    });

    // ----------------------------------------------------
    // 4. REFRESH TOKEN ROTATION CONCURRENCY & REPLAY REVOLUTION
    // ----------------------------------------------------
    await test('Refresh Token Rotation Concurrency: Exactly 1 Succeeds, 1 Rejection', async () => {
      // Perform fresh login to get pristine refresh token
      const loginRes = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rohit@cricket.test', password: 'Password@2026!' },
      });
      const currentToken = extractCookie(loginRes, 'refreshToken');

      // Dispatch 2 simultaneous refresh requests with the exact same token
      const [res1, res2] = await Promise.all([
        request('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { Cookie: `refreshToken=${currentToken}` },
        }),
        request('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { Cookie: `refreshToken=${currentToken}` },
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepStrictEqual(statuses, [200, 401], 'Expected exactly one 200 and one 401');

      const successfulRes = res1.status === 200 ? res1 : res2;
      assert.ok(successfulRes.data.data.accessToken);

      const newCookie = extractCookie(successfulRes, 'refreshToken');
      assert.ok(newCookie);
      assert.notStrictEqual(newCookie, currentToken);

      // Save for subsequent tests
      rohitRefreshToken = newCookie;
      rohitAccessToken = successfulRes.data.data.accessToken;
    });

    await test('Replay Detection & Session Family Revocation', async () => {
      // Re-login to create a clean session family
      const freshLogin = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rohit@cricket.test', password: 'Password@2026!' },
      });
      const tokenA = extractCookie(freshLogin, 'refreshToken');

      // Rotate tokenA -> tokenB
      const rotate1 = await request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${tokenA}` },
      });
      assert.strictEqual(rotate1.status, 200);
      const tokenB = extractCookie(rotate1, 'refreshToken');

      // Replay attack: Attacker re-submits consumed tokenA
      const replayRes = await request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${tokenA}` },
      });
      assert.strictEqual(replayRes.status, 401);
      assert.strictEqual(getErrorCode(replayRes), 'REFRESH_TOKEN_REUSE_DETECTED');

      // Assert that tokenB in the same family has now also been invalidated!
      const subsequentRes = await request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${tokenB}` },
      });
      assert.strictEqual(subsequentRes.status, 401);
    });

    // ----------------------------------------------------
    // 5. PASSWORD CHANGE & SESSION INVALIDATION
    // ----------------------------------------------------
    await test('Password Change Success (PUT /api/v1/auth/password)', async () => {
      // Log in to establish fresh session
      const loginRes = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rohit@cricket.test', password: 'Password@2026!' },
      });
      rohitAccessToken = loginRes.data.data.accessToken;
      rohitRefreshToken = extractCookie(loginRes, 'refreshToken');

      const changeRes = await request('/api/v1/auth/password', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${rohitAccessToken}` },
        body: {
          currentPassword: 'Password@2026!',
          newPassword: 'NewPassword@2026!Updated',
        },
      });

      assert.strictEqual(changeRes.status, 200);
      assert.strictEqual(changeRes.data.success, true);
    });

    await test('Old Refresh Tokens Invalidated After Password Change (401)', async () => {
      // Attempting to refresh with rohitRefreshToken obtained before password change
      const res = await request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${rohitRefreshToken}` },
      });
      assert.strictEqual(res.status, 401);

      // Verify that login works with NEW password
      const newLogin = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rohit@cricket.test', password: 'NewPassword@2026!Updated' },
      });
      assert.strictEqual(newLogin.status, 200);
      rohitAccessToken = newLogin.data.data.accessToken;
      rohitRefreshToken = extractCookie(newLogin, 'refreshToken');
    });

    await test('Password Change Rejection: Wrong Current Password (401)', async () => {
      const res = await request('/api/v1/auth/password', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${rohitAccessToken}` },
        body: {
          currentPassword: 'IncorrectOldPassword@123',
          newPassword: 'AnotherPassword@2026!',
        },
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(getErrorCode(res), 'INVALID_CURRENT_PASSWORD');
    });

    // ----------------------------------------------------
    // 6. LOGOUT SEMANTICS
    // ----------------------------------------------------
    await test('Session Logout (POST /api/v1/auth/logout)', async () => {
      const loginRes = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rohit@cricket.test', password: 'NewPassword@2026!Updated' },
      });
      const tokenToLogout = extractCookie(loginRes, 'refreshToken');

      const logoutRes = await request('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${tokenToLogout}` },
      });
      assert.strictEqual(logoutRes.status, 200);

      // Subsequent refresh must fail
      const refreshRes = await request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${tokenToLogout}` },
      });
      assert.strictEqual(refreshRes.status, 401);
    });

    await test('Logout Stateless JWT Semantics (Token valid until expiry, refresh fails)', async () => {
      const loginRes = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rohit@cricket.test', password: 'NewPassword@2026!Updated' },
      });
      const validJwt = loginRes.data.data.accessToken;
      const refToken = extractCookie(loginRes, 'refreshToken');

      // Logout
      await request('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${refToken}` },
      });

      // Stateless access token still validates
      const meRes = await request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${validJwt}` },
      });
      assert.strictEqual(meRes.status, 200);

      // But cannot refresh
      const refRes = await request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${refToken}` },
      });
      assert.strictEqual(refRes.status, 401);
    });

    await test('Logout All Devices (POST /api/v1/auth/logout-all)', async () => {
      // Create session 1 & session 2
      const s1 = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rohit@cricket.test', password: 'NewPassword@2026!Updated' },
      });
      const s2 = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rohit@cricket.test', password: 'NewPassword@2026!Updated' },
      });

      const token1 = extractCookie(s1, 'refreshToken');
      const token2 = extractCookie(s2, 'refreshToken');
      const jwtToken = s2.data.data.accessToken;

      const logoutAllRes = await request('/api/v1/auth/logout-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      assert.strictEqual(logoutAllRes.status, 200);

      // Both tokens must now fail on refresh
      const ref1 = await request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${token1}` },
      });
      const ref2 = await request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refreshToken=${token2}` },
      });
      assert.strictEqual(ref1.status, 401);
      assert.strictEqual(ref2.status, 401);
    });

    // ----------------------------------------------------
    // 7. SEED CREDENTIAL VERIFICATION
    // ----------------------------------------------------
    await test('Seed Credential Verification: bcrypt.compare matches documented test password', async () => {
      const res = await db.query(
        "SELECT password_hash FROM user_credentials WHERE user_id = '11111111-1111-1111-1111-111111111111'"
      );
      assert.strictEqual(res.rows.length, 1);
      const storedHash = res.rows[0].password_hash;
      assert.strictEqual(
        bcrypt.compareSync('LocalCricket@2026!', storedHash),
        true,
        'Expected seed credential hash to match documented password LocalCricket@2026!'
      );
    });

    // ----------------------------------------------------
    // 8. PRODUCTION x-user-id INVARIANTS & JWT SECRET CHECKS
    // ----------------------------------------------------
    await test('Production Invariant 1: Production + x-user-id only returns 401 Unauthorized', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const res = await request('/api/v1/auth/me', {
          headers: { 'x-user-id': '11111111-1111-1111-1111-111111111111' },
        });
        assert.strictEqual(res.status, 401);
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });

    await test('Production Invariant 2: Production + valid JWT + conflicting x-user-id uses JWT exclusively', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-super-secure-production-jwt-secret-with-plenty-of-entropy-1234567890!';
      try {
        const uRes = await db.query("SELECT id FROM users WHERE email = 'rohit@cricket.test'");
        const rohitId = uRes.rows[0].id;

        const rohitJwt = generateAccessToken({
          id: rohitId,
          email: 'rohit@cricket.test',
          full_name: 'Rohit Sharma',
          global_role: 'USER',
        });

        const res = await request('/api/v1/auth/me', {
          headers: {
            Authorization: `Bearer ${rohitJwt}`,
            'x-user-id': '11111111-1111-1111-1111-111111111111', // Conflicting dev header
          },
        });
        assert.strictEqual(res.status, 200);
        // Assert caller identity is derived strictly from JWT
        assert.strictEqual(res.data.data.id, rohitId);
        assert.strictEqual(res.data.data.email, 'rohit@cricket.test');
      } finally {
        process.env.NODE_ENV = 'test';
        delete process.env.JWT_SECRET;
      }
    });

    await test('Production Invariant 3: Production + invalid JWT + x-user-id returns 401 Unauthorized', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-super-secure-production-jwt-secret-with-plenty-of-entropy-1234567890!';
      try {
        const res = await request('/api/v1/auth/me', {
          headers: {
            Authorization: 'Bearer invalid.bogus.jwt',
            'x-user-id': '11111111-1111-1111-1111-111111111111',
          },
        });
        assert.strictEqual(res.status, 401);
      } finally {
        process.env.NODE_ENV = 'test';
        delete process.env.JWT_SECRET;
      }
    });

    await test('JWT Secret Startup Validation: Missing or insecure JWT_SECRET throws in production', async () => {
      process.env.NODE_ENV = 'production';
      const origSecret = process.env.JWT_SECRET;
      try {
        delete process.env.JWT_SECRET;
        assert.throws(() => validateJwtSecretConfig(), /FATAL: JWT_SECRET environment variable is mandatory/);

        process.env.JWT_SECRET = 'short';
        assert.throws(() => validateJwtSecretConfig(), /FATAL: JWT_SECRET in production must provide at least 32 bytes/);

        process.env.JWT_SECRET = 'dev-jwt-secret';
        assert.throws(() => validateJwtSecretConfig(), /FATAL: Known insecure development secret/);
      } finally {
        process.env.NODE_ENV = 'test';
        if (origSecret) {
          process.env.JWT_SECRET = origSecret;
        } else {
          delete process.env.JWT_SECRET;
        }
      }
    });

    // ----------------------------------------------------
    // 9. ORGANIZER INVITATION FLOW & SECURITY CHECKS
    // ----------------------------------------------------
    await test('Organizer Invitation Generation: Valid 7-day token created for UMPIRE (201)', async () => {
      // Amit Sharma is organizer of tournament 33333333-3333-3333-3333-333333333333
      const res = await request('/api/v1/tournaments/33333333-3333-3333-3333-333333333333/invitations', {
        method: 'POST',
        headers: { 'x-user-id': '11111111-1111-1111-1111-111111111111' },
        body: {
          role: 'UMPIRE',
          invitedEmail: 'official.umpire@cricket.test',
          metadata: { note: 'Senior umpire assignment' },
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data.token);
      assert.strictEqual(res.data.data.token.length, 64);
      assert.strictEqual(res.data.data.invitation.role, 'UMPIRE');

      testInviteToken = res.data.data.token;
    });

    await test('Organizer Invitation Authorization Guard: Non-organizer rejected with 403', async () => {
      // Suresh Raina is SCORER, not ORGANIZER
      const res = await request('/api/v1/tournaments/33333333-3333-3333-3333-333333333333/invitations', {
        method: 'POST',
        headers: { 'x-user-id': '22222222-2222-2222-2222-222222222222' },
        body: {
          role: 'SCORER',
          invitedEmail: 'scorer2@cricket.test',
        },
      });
      assert.strictEqual(res.status, 403);
    });

    await test('Invitation Acceptance Success: Atomically joins tournament_members with designated role (200)', async () => {
      // Register official.umpire@cricket.test
      const regRes = await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Nitin Menon',
          email: 'official.umpire@cricket.test',
          password: 'Password@2026!',
        },
      });
      const umpireJwt = regRes.data.data.accessToken;

      const acceptRes = await request(`/api/v1/invitations/${testInviteToken}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${umpireJwt}` },
      });

      assert.strictEqual(acceptRes.status, 200);
      assert.strictEqual(acceptRes.data.success, true);
      assert.strictEqual(acceptRes.data.data.role, 'UMPIRE');

      // Verify membership in database
      const memRes = await db.query(
        "SELECT role FROM tournament_members WHERE tournament_id = '33333333-3333-3333-3333-333333333333' AND user_id = $1",
        [regRes.data.data.user.id]
      );
      assert.strictEqual(memRes.rows.length, 1);
      assert.strictEqual(memRes.rows[0].role, 'UMPIRE');
    });

    await test('Invitation Single-Use Guard: Re-accepting consumed token returns 409', async () => {
      // Login as umpire
      const logRes = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'official.umpire@cricket.test', password: 'Password@2026!' },
      });
      const umpireJwt = logRes.data.data.accessToken;

      const repeatRes = await request(`/api/v1/invitations/${testInviteToken}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${umpireJwt}` },
      });
      assert.strictEqual(repeatRes.status, 409);
      assert.strictEqual(getErrorCode(repeatRes), 'INVITATION_ALREADY_ACCEPTED');
    });

    await test('Invitation Expiration Guard: Accepting expired token returns 410 Gone', async () => {
      // Insert already expired invitation directly into DB
      const expiredRawToken = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');

      await db.query(
        `INSERT INTO tournament_invitations (
           tournament_id, invitation_token_hash, invited_email, role, status, created_by_user_id, expires_at
         ) VALUES (
           '33333333-3333-3333-3333-333333333333', $1, 'expired@cricket.test', 'SCORER', 'PENDING',
           '11111111-1111-1111-1111-111111111111', NOW() - INTERVAL '1 hour'
         )`,
        [hash]
      );

      const logRes = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'official.umpire@cricket.test', password: 'Password@2026!' },
      });

      const res = await request(`/api/v1/invitations/${expiredRawToken}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${logRes.data.data.accessToken}` },
      });
      assert.strictEqual(res.status, 410);
      assert.strictEqual(getErrorCode(res), 'INVITATION_EXPIRED');
    });

    await test('Invitation Email Mismatch Guard: Wrong user acceptance rejected with 403', async () => {
      // Create invitation restricted to specific.user@cricket.test
      const genRes = await request('/api/v1/tournaments/33333333-3333-3333-3333-333333333333/invitations', {
        method: 'POST',
        headers: { 'x-user-id': '11111111-1111-1111-1111-111111111111' },
        body: {
          role: 'VIEWER',
          invitedEmail: 'specific.user@cricket.test',
        },
      });
      const restrictedToken = genRes.data.data.token;

      // Rohit Sharma (rohit@cricket.test) tries to accept it
      const logRes = await request('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rohit@cricket.test', password: 'NewPassword@2026!Updated' },
      });

      const res = await request(`/api/v1/invitations/${restrictedToken}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${logRes.data.data.accessToken}` },
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(getErrorCode(res), 'INVITATION_EMAIL_MISMATCH');
    });

    await test('Invitation Team Validation: Foreign tournament team rejected with 400', async () => {
      const res = await request('/api/v1/tournaments/33333333-3333-3333-3333-333333333333/invitations', {
        method: 'POST',
        headers: { 'x-user-id': '11111111-1111-1111-1111-111111111111' },
        body: {
          role: 'SCORER',
          metadata: { team_id: '99999999-9999-9999-9999-999999999999' }, // Arbitrary team ID
        },
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(getErrorCode(res), 'INVALID_TOURNAMENT_TEAM');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }

  console.log(`\n🎉 Milestone 11 Auth & JWT Suite: ${passedTests} / ${totalTests} Passed ✅\n`);
  return { passedTests, totalTests };
}

// Allow standalone execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMilestone11AuthTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
