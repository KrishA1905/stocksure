/**
 * Throw these from routes/services; the central error handler converts them
 * into the standard { success: false, message, data: null } response.
 */
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details; // optional, e.g. field errors for 422
    this.expose = true; // message is safe to show to clients
  }

  static badRequest(message = 'Bad request') {
    return new ApiError(400, message);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Request conflicts with the current state') {
    return new ApiError(409, message);
  }

  static validation(message = 'Validation failed', errors = []) {
    return new ApiError(422, message, errors);
  }
}

module.exports = ApiError;
