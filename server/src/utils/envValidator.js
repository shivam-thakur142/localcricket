// ====================================================================
// PRODUCTION ENVIRONMENT VALIDATION (server/src/utils/envValidator.js)
// ====================================================================

const WEAK_JWT_DEFAULTS = [
  'secret',
  'changeme',
  'jwt_secret',
  'default_jwt_secret',
  'localcricket@2026!',
  'password',
  'test_secret',
  'supersecret',
];

/**
 * Validates runtime environment configuration against strict production contracts.
 * NEVER outputs secret values in error messages.
 *
 * @param {Object} [env=process.env] Environment variables map
 * @throws {Error} If any validation rule fails
 */
export function validateEnvironment(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const errors = [];

  // 1. Port Validation
  const port = parseInt(env.PORT || '5000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('PORT must be a valid integer between 1 and 65535');
  }

  // 2. Database URI Validation
  if (isProduction) {
    if (!env.DATABASE_URL) {
      errors.push('DATABASE_URL is required in production');
    } else if (
      !env.DATABASE_URL.startsWith('postgres://') &&
      !env.DATABASE_URL.startsWith('postgresql://')
    ) {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection URI (postgres:// or postgresql://)');
    }
  }

  // 3. JWT Secret Cryptographic Hardening
  if (isProduction) {
    if (!env.JWT_SECRET) {
      errors.push('JWT_SECRET is required in production');
    } else {
      if (env.JWT_SECRET.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters long in production');
      }
      const lowerSecret = env.JWT_SECRET.toLowerCase();
      if (WEAK_JWT_DEFAULTS.some((d) => lowerSecret.includes(d))) {
        errors.push('JWT_SECRET must not contain common placeholder or default strings');
      }
    }
  }

  // 4. CORS Origin Configuration
  if (isProduction) {
    if (!env.CORS_ORIGIN) {
      errors.push('CORS_ORIGIN is required in production (e.g. https://localcricket.app)');
    } else if (env.CORS_ORIGIN.trim() === '*') {
      errors.push('CORS_ORIGIN cannot be wildcard (*) when credentials are enabled in production');
    }
  }

  // 5. Database TLS / SSL Hardening (MANDATORY IN PRODUCTION)
  if (isProduction) {
    if (env.DB_SSL !== 'true') {
      errors.push('DB_SSL must be explicitly set to "true" in production (no unencrypted database traffic)');
    }
    if (env.DB_SSL_REJECT_UNAUTHORIZED !== 'true' && env.DB_SSL_ALLOW_SELF_SIGNED !== 'true') {
      errors.push('DB_SSL_REJECT_UNAUTHORIZED must be explicitly set to "true" in production (certificate validation required)');
    }
  }

  // 6. Shutdown Timeout
  if (env.SHUTDOWN_TIMEOUT_MS) {
    const timeout = parseInt(env.SHUTDOWN_TIMEOUT_MS, 10);
    if (isNaN(timeout) || timeout < 1000 || timeout > 60000) {
      errors.push('SHUTDOWN_TIMEOUT_MS must be an integer between 1000ms and 60000ms');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Production Environment Configuration Validation Failed:\n - ${errors.join('\n - ')}`);
  }

  return true;
}
