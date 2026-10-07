// ====================================================================
// AUTHENTICATION MIDDLEWARE: DUAL-MODE JWT & PRODUCTION INVARIANTS
// ====================================================================

import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../services/tokenService.js';

export function createAuthMiddleware(db) {
  return async function authenticate(req, res, next) {
    try {
      const isProduction = process.env.NODE_ENV === 'production';
      const authHeader = req.headers['authorization'];
      const rawXUserId = req.headers['x-user-id'];

      // 1. Production Mode: Strict Cryptographic JWT Enforcement
      if (isProduction) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw ApiError.unauthorized(
            'Authentication required: Missing or malformed Bearer token',
            'UNAUTHORIZED'
          );
        }

        const token = authHeader.substring(7).trim();
        const decoded = verifyAccessToken(token);

        // JWT claims are authoritative; x-user-id is strictly ignored
        req.user = {
          id: decoded.sub,
          email: decoded.email,
          full_name: decoded.full_name,
          global_role: decoded.global_role || 'USER',
        };
      } else {
        // 2. Development / Test Mode: Dual-Mode with M1–M10 Backward Compatibility
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7).trim();

          // Attempt JWT verification first
          try {
            const decoded = verifyAccessToken(token);
            req.user = {
              id: decoded.sub,
              email: decoded.email,
              full_name: decoded.full_name,
              global_role: decoded.global_role || 'USER',
            };
          } catch (jwtErr) {
            // If token matches UUID format (legacy test harness mock token), check database
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
            if (isUuid) {
              const userRes = await db.query('SELECT * FROM users WHERE id = $1', [token]);
              if (userRes.rows.length > 0) {
                req.user = userRes.rows[0];
              }
            } else {
              throw jwtErr;
            }
          }
        } else if (rawXUserId) {
          // Fallback in dev/test: Check x-user-id header to support existing M1–M10 unit tests
          const userRes = await db.query('SELECT * FROM users WHERE id = $1', [rawXUserId]);
          if (userRes.rows.length === 0) {
            throw ApiError.unauthorized(`User with ID ${rawXUserId} does not exist`);
          }
          req.user = userRes.rows[0];
        }
      }

      if (!req.user) {
        throw ApiError.unauthorized(
          'Authentication required: Missing user token or x-user-id header',
          'UNAUTHORIZED'
        );
      }

      // Check account suspension status & sync authoritative global_role from DB
      if (req.user?.id) {
        const colRes = await db.query(
          "SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_suspended';"
        );
        if (colRes.rows.length > 0) {
          const userStatusRes = await db.query(
            'SELECT is_suspended, suspension_reason, global_role FROM users WHERE id = $1',
            [req.user.id]
          );
          if (userStatusRes.rows.length > 0) {
            if (userStatusRes.rows[0].is_suspended) {
              throw ApiError.forbidden(
                `Your account has been suspended by a platform administrator: ${userStatusRes.rows[0].suspension_reason || 'Administrative action'}`,
                'ACCOUNT_SUSPENDED'
              );
            }
            req.user.global_role = userStatusRes.rows[0].global_role;
            req.user.is_suspended = false;
          }
        }
      }

      return next();
    } catch (err) {
      next(err);
    }
  };
}
