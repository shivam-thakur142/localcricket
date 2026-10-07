// ====================================================================
// DOMAIN & API ERROR DEFINITIONS
// ====================================================================

export class ApiError extends Error {
  constructor(statusCode, message, errorCode = 'API_ERROR', details = []) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errorCode = 'BAD_REQUEST', details = []) {
    return new ApiError(400, message, errorCode, details);
  }

  static unauthorized(message = 'Authentication required', errorCode = 'UNAUTHORIZED') {
    return new ApiError(401, message, errorCode);
  }

  static forbidden(message = 'Forbidden: Insufficient permissions', errorCode = 'FORBIDDEN') {
    return new ApiError(403, message, errorCode);
  }

  static notFound(message = 'Resource not found', errorCode = 'NOT_FOUND') {
    return new ApiError(404, message, errorCode);
  }

  static conflict(message, errorCode = 'CONFLICT', details = []) {
    return new ApiError(409, message, errorCode, details);
  }

  static unprocessable(message, errorCode = 'UNPROCESSABLE_ENTITY', details = []) {
    return new ApiError(422, message, errorCode, details);
  }

  static internal(message = 'Internal server error', errorCode = 'INTERNAL_ERROR') {
    return new ApiError(500, message, errorCode);
  }
}
