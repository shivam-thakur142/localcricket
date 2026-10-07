// ====================================================================
// SECURITY MIDDLEWARE: HELMET, CORS, TIERED RATE LIMITING, COMPRESSION
// (server/src/middleware/securityMiddleware.js)
// ====================================================================

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

/**
 * Creates Helmet security headers with hardened CSP.
 * Specifically avoids 'unsafe-inline' for scripts while permitting
 * inline styles for dynamic Sunlight/Battery theme CSS variables.
 */
export function createSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // HARDENED: Strictly NO 'unsafe-inline'
        styleSrc: ["'self'", "'unsafe-inline'"], // Permitted for dynamic theme variables
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    xContentTypeOptions: true,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}

/**
 * Creates strict CORS middleware supporting HTTP-only credentials
 * and configurable origin whitelists.
 */
export function createCorsMiddleware() {
  const isProduction = process.env.NODE_ENV === 'production';
  const rawOrigins = process.env.CORS_ORIGIN || '';

  const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : isProduction
    ? []
    : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5000',
        'http://127.0.0.1:5000',
      ];

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, mobile native webview)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const corsError = new Error(`Origin "${origin}" is not authorized by LocalCricket CORS policy.`);
      corsError.status = 403;
      corsError.code = 'CORS_ORIGIN_DENIED';
      return callback(corsError, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-idempotency-key',
      'x-user-id',
      'x-offline-replay',
    ],
    maxAge: 86400, // 24 hours preflight cache
  });
}

/**
 * Tier 1: Authentication Rate Limiter (10 requests / 15 minutes)
 * Protects against credential stuffing and password brute forcing.
 */
export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.RATE_LIMIT_DISABLED === 'true',
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          message: 'Too many authentication attempts. Please try again in 15 minutes.',
        },
      });
    },
  });
}

/**
 * Tier 2: Scorer Mutation Rate Limiter (120 requests / minute)
 * Keyed by authenticated Scorer User ID (fallback to IP).
 * High burst capacity ensures rapid deliveries & offline replay drainage are never throttled.
 * SECURITY: 'x-offline-replay' does NOT bypass this rate limiter!
 */
export function createScorerRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: (req) => req.user?.id || req.ip,
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.RATE_LIMIT_DISABLED === 'true',
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'SCORER_RATE_LIMIT_EXCEEDED',
          message: 'Scoring request rate limit exceeded. Please wait a moment before sending more deliveries.',
        },
      });
    },
  });
}

/**
 * Tier 3: Public Read Rate Limiter (300 requests / minute)
 * Protects tournament rosters, leaderboards, and standings against automated scraping.
 */
export function createPublicRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      process.env.RATE_LIMIT_DISABLED === 'true' ||
      Boolean(req.originalUrl && (req.originalUrl.includes('/scorer') || req.originalUrl.includes('/auth'))) ||
      Boolean(req.baseUrl && (req.baseUrl.includes('/scorer') || req.baseUrl.includes('/auth'))),
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down your requests to LocalCricket API.',
        },
      });
    },
  });
}

/**
 * HTTP Compression Middleware (threshold: 1024 bytes)
 */
export function createCompressionMiddleware() {
  return compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  });
}
