// ====================================================================
// TOKEN SERVICE: JWT SIGNING, VERIFICATION & HIGH-ENTROPY OPAQUE TOKENS
// ====================================================================

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';

const KNOWN_DEV_SECRETS = new Set([
  'dev-jwt-secret',
  'localcricket-dev-key',
  'LocalCricket@2026!',
  'secret',
  'password',
]);

const DEFAULT_DEV_SECRET = 'dev-insecure-test-secret-32-bytes-long-key-for-localcricket!!';

/**
 * Validates JWT secrets according to production requirements.
 * Halts startup in production if secret is missing or insecure.
 */
export function validateJwtSecretConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET;

  if (isProduction) {
    if (!secret || secret.trim().length === 0) {
      throw new Error('FATAL: JWT_SECRET environment variable is mandatory in production.');
    }
    if (KNOWN_DEV_SECRETS.has(secret)) {
      throw new Error('FATAL: Known insecure development secret cannot be used in production.');
    }
    if (secret.length < 32) {
      throw new Error('FATAL: JWT_SECRET in production must provide at least 32 bytes (256 bits) of entropy.');
    }
  }

  return secret || DEFAULT_DEV_SECRET;
}

/**
 * Retrieves primary signing secret
 */
export function getJwtSecret() {
  return validateJwtSecretConfig();
}

/**
 * Retrieves previous signing secret for dual-key rotation
 */
export function getPreviousJwtSecret() {
  return process.env.JWT_SECRET_PREVIOUS || null;
}

/**
 * Generate a short-lived 15-minute access JWT
 * @param {Object} user 
 * @returns {string} Signed JWT
 */
export function generateAccessToken(user) {
  const secret = getJwtSecret();
  const payload = {
    sub: user.id || user.sub,
    email: user.email,
    full_name: user.full_name,
    global_role: user.global_role || 'USER',
    token_type: 'access',
    jti: crypto.randomUUID(),
  };

  return jwt.sign(payload, secret, {
    expiresIn: '15m',
    algorithm: 'HS256',
  });
}

/**
 * Verifies access JWT with dual-key rotation support
 * @param {string} token 
 * @returns {Object} decoded claims
 */
export function verifyAccessToken(token) {
  if (!token) {
    throw ApiError.unauthorized('Access token is required', 'TOKEN_MISSING');
  }

  const primarySecret = getJwtSecret();
  const previousSecret = getPreviousJwtSecret();

  try {
    return jwt.verify(token, primarySecret, { algorithms: ['HS256'] });
  } catch (err) {
    // If dual-key rotation is configured and primary verification failed, try previous secret
    if (previousSecret && err.name === 'JsonWebTokenError') {
      try {
        return jwt.verify(token, previousSecret, { algorithms: ['HS256'] });
      } catch (prevErr) {
        // Fall through to error handler
      }
    }

    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token has expired', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid access token signature or payload', 'TOKEN_INVALID');
  }
}

/**
 * Generate 64-byte opaque high-entropy refresh token
 * @returns {string} 128 hex chars
 */
export function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Hash refresh token using SHA-256 for secure database storage
 * @param {string} token 
 * @returns {string} 64 hex chars
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate 32-byte opaque invitation token
 * @returns {string} 64 hex chars
 */
export function generateInvitationToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash invitation token using SHA-256 for database lookup
 * @param {string} token 
 * @returns {string} 64 hex chars
 */
export function hashInvitationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
