// ====================================================================
// GLOBAL EXPRESS ERROR HANDLER
// ====================================================================

import { ApiError } from '../utils/ApiError.js';

export function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle known ApiError
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Handle errors with explicit HTTP status codes (e.g. CORS, body-parser)
  if (err.status || err.statusCode) {
    const statusCode = err.status || err.statusCode;
    return res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || err.errorCode || 'HTTP_ERROR',
        message: err.message || 'Request failed',
        details: err.details || [],
      },
    });
  }

  // Handle PostgreSQL / PGlite database integrity errors
  if (err.code) {
    // 23505: Unique constraint violation
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: err.message || 'Duplicate resource conflict',
          details: [{ constraint: err.constraint }],
        },
      });
    }

    // 23503: Foreign key violation
    if (err.code === '23503') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FOREIGN_KEY_VIOLATION',
          message: err.message || 'Referenced resource does not exist',
          details: [{ constraint: err.constraint }],
        },
      });
    }

    // 23514: Check constraint violation
    if (err.code === '23514') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CHECK_CONSTRAINT_VIOLATION',
          message: err.message || 'Domain check constraint violated',
          details: [{ constraint: err.constraint }],
        },
      });
    }

    // P0001: Trigger exception (RAISE EXCEPTION in plpgsql)
    if (err.code === 'P0001') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DATABASE_INTEGRITY_TRIGGER_VIOLATION',
          message: err.message || 'Database integrity trigger rejected the operation',
          details: [],
        },
      });
    }
  }

  // Default unhandled error
  console.error('[UNHANDLED_ERROR]:', err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected internal error occurred',
      details: [],
    },
  });
}
