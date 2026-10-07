// ====================================================================
// AUTHENTICATION SERVICE: BCRYPT HASHING, SESSIONS, CONCURRENCY & RBAC
// ====================================================================

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/ApiError.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from './tokenService.js';

// In-Memory sliding-window rate limiter for M11 (Option B scope)
// In M14 this interfaces with distributed Redis/PostgreSQL store
const rateLimitBuckets = new Map();

/**
 * In-memory rate limiting check
 * @param {string} key 
 * @param {number} maxRequests 
 * @param {number} windowMs 
 */
export function checkRateLimit(key, maxRequests, windowMs) {
  if (process.env.RATE_LIMIT_DISABLED === 'true') {
    return;
  }

  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || { timestamps: [] };
  
  // Filter out timestamps outside sliding window
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (bucket.timestamps.length >= maxRequests) {
    throw new ApiError(
      429,
      'Too many requests. Please try again later.',
      'RATE_LIMIT_EXCEEDED'
    );
  }

  bucket.timestamps.push(now);
  rateLimitBuckets.set(key, bucket);
}

/**
 * Clear rate limit store (used in test setup)
 */
export function resetRateLimits() {
  rateLimitBuckets.clear();
}

/**
 * Validates password complexity against defined invariants:
 * - 8 to 128 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special symbol
 */
export function validatePasswordComplexity(password) {
  if (!password || typeof password !== 'string') {
    throw ApiError.badRequest('Password is required', 'PASSWORD_REQUIRED');
  }

  const trimmed = password.trim();
  if (trimmed.length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters long', 'PASSWORD_TOO_SHORT');
  }
  if (trimmed.length > 128) {
    throw ApiError.badRequest('Password cannot exceed 128 characters', 'PASSWORD_TOO_LONG');
  }
  if (!/[A-Z]/.test(trimmed)) {
    throw ApiError.badRequest('Password must contain at least one uppercase letter', 'PASSWORD_NO_UPPERCASE');
  }
  if (!/[a-z]/.test(trimmed)) {
    throw ApiError.badRequest('Password must contain at least one lowercase letter', 'PASSWORD_NO_LOWERCASE');
  }
  if (!/[0-9]/.test(trimmed)) {
    throw ApiError.badRequest('Password must contain at least one number', 'PASSWORD_NO_NUMBER');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) {
    throw ApiError.badRequest('Password must contain at least one special symbol', 'PASSWORD_NO_SYMBOL');
  }

  return trimmed;
}

/**
 * Registers a new user account with hashed credentials and active session
 */
export async function registerUser(db, { fullName, email, password, phone, userAgent, ipAddress }) {
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
    throw ApiError.badRequest('Full name is required', 'NAME_REQUIRED');
  }
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    throw ApiError.badRequest('Email address is required', 'EMAIL_REQUIRED');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const validPassword = validatePasswordComplexity(password);

  // Check email uniqueness
  const existingUserRes = await db.query(
    'SELECT id FROM users WHERE lower(email) = $1',
    [normalizedEmail]
  );
  if (existingUserRes.rows.length > 0) {
    throw ApiError.conflict('An account with this email address already exists', 'EMAIL_ALREADY_EXISTS');
  }

  // Hash password using bcrypt cost factor 12
  const passwordHash = await bcrypt.hash(validPassword, 12);

  // Insert into auth.users stub (or Supabase auth)
  const authUserId = crypto.randomUUID();
  await db.query(
    'INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [authUserId, normalizedEmail]
  );

  // Insert user profile
  const userRes = await db.query(
    `INSERT INTO users (auth_user_id, full_name, email, phone, global_role)
     VALUES ($1, $2, $3, $4, 'USER')
     RETURNING id, full_name, email, phone, global_role, created_at`,
    [authUserId, fullName.trim(), normalizedEmail, phone ? phone.trim() : null]
  );
  const user = userRes.rows[0];

  // Insert user credentials
  await db.query(
    `INSERT INTO user_credentials (user_id, password_hash)
     VALUES ($1, $2)`,
    [user.id, passwordHash]
  );

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const rawRefreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(rawRefreshToken);

  // Create initial user session
  await db.query(
    `INSERT INTO user_sessions (
       user_id, refresh_token_hash, session_family_id, expires_at, user_agent, ip_address
     ) VALUES (
       $1, $2, gen_random_uuid(), NOW() + INTERVAL '7 days', $3, $4
     )`,
    [user.id, refreshTokenHash, userAgent || null, ipAddress || null]
  );

  return { user, accessToken, refreshToken: rawRefreshToken };
}

/**
 * Authenticates user credentials with brute-force account lockout defense
 */
export async function loginUser(db, { email, password, userAgent, ipAddress }) {
  if (!email || !password) {
    throw ApiError.badRequest('Email and password are required', 'MISSING_CREDENTIALS');
  }

  checkRateLimit(`ip:${ipAddress || 'unknown'}:login`, 10, 60 * 1000);

  const normalizedEmail = email.trim().toLowerCase();

  const userRes = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.global_role,
            c.password_hash, c.failed_login_attempts, c.locked_until
     FROM users u
     JOIN user_credentials c ON u.id = c.user_id
     WHERE lower(u.email) = $1`,
    [normalizedEmail]
  );

  if (userRes.rows.length === 0) {
    // Constant-time dummy hash comparison to thwart timing side-channel attacks
    await bcrypt.compare(password, '$2b$12$/qCsressW.39cBScHHb7OOdSjEAQx0DSEFbtqczJC8OcKcrW6MjpC');
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const user = userRes.rows[0];

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw ApiError.unauthorized(
      'Account is temporarily locked due to multiple failed login attempts. Please try again later.',
      'ACCOUNT_TEMPORARILY_LOCKED'
    );
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordMatch) {
    const newFailCount = user.failed_login_attempts + 1;
    if (newFailCount >= 5) {
      await db.query(
        `UPDATE user_credentials
         SET failed_login_attempts = $1, locked_until = NOW() + INTERVAL '15 minutes'
         WHERE user_id = $2`,
        [newFailCount, user.id]
      );
      throw ApiError.unauthorized(
        'Account has been locked for 15 minutes due to 5 consecutive failed login attempts.',
        'ACCOUNT_TEMPORARILY_LOCKED'
      );
    } else {
      await db.query(
        `UPDATE user_credentials
         SET failed_login_attempts = $1
         WHERE user_id = $2`,
        [newFailCount, user.id]
      );
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
  }

  // Reset failed login attempts on successful authentication
  await db.query(
    `UPDATE user_credentials
     SET failed_login_attempts = 0, locked_until = NULL
     WHERE user_id = $1`,
    [user.id]
  );

  const cleanUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    global_role: user.global_role,
  };

  const accessToken = generateAccessToken(cleanUser);
  const rawRefreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(rawRefreshToken);

  await db.query(
    `INSERT INTO user_sessions (
       user_id, refresh_token_hash, session_family_id, expires_at, user_agent, ip_address
     ) VALUES (
       $1, $2, gen_random_uuid(), NOW() + INTERVAL '7 days', $3, $4
     )`,
    [user.id, refreshTokenHash, userAgent || null, ipAddress || null]
  );

  return { user: cleanUser, accessToken, refreshToken: rawRefreshToken };
}

/**
 * Concurrency-safe refresh token rotation using SELECT ... FOR UPDATE
 * Guarantees atomic consumption and deterministic family revocation upon replay
 */
export async function rotateRefreshToken(db, rawRefreshToken, { userAgent, ipAddress }) {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    throw ApiError.unauthorized('Refresh token is required', 'REFRESH_TOKEN_REQUIRED');
  }

  checkRateLimit(`ip:${ipAddress || 'unknown'}:refresh`, 30, 60 * 1000);

  const incomingHash = hashToken(rawRefreshToken);

  try {
    await db.query('BEGIN');

    // 1. Acquire exclusive row lock on this session
    const sessionRes = await db.query(
      `SELECT id, user_id, session_family_id, is_revoked, expires_at
       FROM user_sessions
       WHERE refresh_token_hash = $1
       FOR UPDATE`,
      [incomingHash]
    );

    if (sessionRes.rows.length === 0) {
      await db.query('ROLLBACK');
      throw ApiError.unauthorized('Invalid refresh session', 'SESSION_NOT_FOUND');
    }

    const session = sessionRes.rows[0];

    // 2. Replay Detection: Token already revoked / consumed
    if (session.is_revoked) {
      // Invalidate the entire session family tree immediately
      await db.query(
        `UPDATE user_sessions
         SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = 'FAMILY_REUSE_DETECTED'
         WHERE session_family_id = $1`,
        [session.session_family_id]
      );
      await db.query('COMMIT');
      throw ApiError.unauthorized(
        'Token reuse detected. All active sessions in family have been revoked.',
        'REFRESH_TOKEN_REUSE_DETECTED'
      );
    }

    // 3. Expiration Check
    if (new Date(session.expires_at) < new Date()) {
      await db.query(
        `UPDATE user_sessions
         SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = 'EXPIRED'
         WHERE id = $1`,
        [session.id]
      );
      await db.query('COMMIT');
      throw ApiError.unauthorized('Refresh token has expired. Please log in again.', 'REFRESH_TOKEN_EXPIRED');
    }

    // 4. Consume current session token
    await db.query(
      `UPDATE user_sessions
       SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = 'ROTATED'
       WHERE id = $1`,
      [session.id]
    );

    // 5. Issue brand new token in the SAME session family
    const newRawRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashToken(newRawRefreshToken);

    await db.query(
      `INSERT INTO user_sessions (
         user_id, refresh_token_hash, session_family_id, expires_at, user_agent, ip_address
       ) VALUES (
         $1, $2, $3, NOW() + INTERVAL '7 days', $4, $5
       )`,
      [session.user_id, newRefreshTokenHash, session.session_family_id, userAgent || null, ipAddress || null]
    );

    // Fetch user profile for new access token
    const userRes = await db.query(
      `SELECT id, full_name, email, phone, global_role
       FROM users
       WHERE id = $1`,
      [session.user_id]
    );

    if (userRes.rows.length === 0) {
      await db.query('ROLLBACK');
      throw ApiError.unauthorized('User not found for session', 'USER_NOT_FOUND');
    }

    const cleanUser = userRes.rows[0];
    const newAccessToken = generateAccessToken(cleanUser);

    await db.query('COMMIT');

    return {
      user: cleanUser,
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
    };
  } catch (err) {
    try {
      await db.query('ROLLBACK');
    } catch (_) {
      // rollback error suppressed
    }
    throw err;
  }
}

/**
 * Revokes current session on logout
 */
export async function logoutSession(db, rawRefreshToken) {
  if (!rawRefreshToken) {
    return { success: true };
  }

  const incomingHash = hashToken(rawRefreshToken);
  await db.query(
    `UPDATE user_sessions
     SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = 'LOGOUT'
     WHERE refresh_token_hash = $1 AND is_revoked = FALSE`,
    [incomingHash]
  );

  return { success: true };
}

/**
 * Revokes all sessions across all devices for a given user
 */
export async function logoutAllSessions(db, userId) {
  await db.query(
    `UPDATE user_sessions
     SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = 'GLOBAL_LOGOUT'
     WHERE user_id = $1 AND is_revoked = FALSE`,
    [userId]
  );

  return { success: true };
}

/**
 * Changes password and invalidates all existing sessions for the user
 */
export async function changePassword(db, userId, { currentPassword, newPassword }) {
  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest('Both current and new password are required', 'MISSING_PASSWORDS');
  }

  const credRes = await db.query(
    `SELECT password_hash FROM user_credentials WHERE user_id = $1`,
    [userId]
  );

  if (credRes.rows.length === 0) {
    throw ApiError.notFound('User credentials not found', 'CREDENTIALS_NOT_FOUND');
  }

  const { password_hash } = credRes.rows[0];
  const isMatch = await bcrypt.compare(currentPassword, password_hash);
  if (!isMatch) {
    throw ApiError.unauthorized('Incorrect current password', 'INVALID_CURRENT_PASSWORD');
  }

  const validNewPassword = validatePasswordComplexity(newPassword);
  if (currentPassword === validNewPassword) {
    throw ApiError.badRequest('New password must differ from current password', 'PASSWORD_UNCHANGED');
  }

  const newHash = await bcrypt.hash(validNewPassword, 12);

  try {
    await db.query('BEGIN');

    // Update password hash
    await db.query(
      `UPDATE user_credentials
       SET password_hash = $1, password_updated_at = NOW(), failed_login_attempts = 0, locked_until = NULL
       WHERE user_id = $2`,
      [newHash, userId]
    );

    // Invalidate ALL active refresh sessions for this user across all devices
    await db.query(
      `UPDATE user_sessions
       SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = 'PASSWORD_CHANGED'
       WHERE user_id = $1 AND is_revoked = FALSE`,
      [userId]
    );

    await db.query('COMMIT');

    return {
      success: true,
      message: 'Password updated successfully. All active sessions have been invalidated.',
    };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

/**
 * Fetches current user profile
 */
export async function getUserProfile(db, userId) {
  const userRes = await db.query(
    `SELECT id, full_name, email, phone, global_role, avatar_url, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  }

  return userRes.rows[0];
}

/**
 * Updates user profile details
 */
export async function updateUserProfile(db, userId, { fullName, phone, avatarUrl }) {
  const userRes = await db.query(
    `UPDATE users
     SET full_name = COALESCE($1, full_name),
         phone = COALESCE($2, phone),
         avatar_url = COALESCE($3, avatar_url),
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, full_name, email, phone, global_role, avatar_url, updated_at`,
    [fullName || null, phone || null, avatarUrl || null, userId]
  );

  if (userRes.rows.length === 0) {
    throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  }

  return userRes.rows[0];
}
