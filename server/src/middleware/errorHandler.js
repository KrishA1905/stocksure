const { Prisma } = require('@prisma/client');
const { ZodError } = require('zod');
const env = require('../config/env');
const ApiError = require('../utils/apiError');
const { sendError } = require('../utils/response');

function notFoundHandler(req, res) {
  return sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl.split('?')[0]}`);
}

/**
 * handleApiError: the ONE place errors become HTTP responses.
 * - ApiError       -> its status + message
 * - ZodError       -> 422
 * - Prisma known   -> 409 / 404 / 422 (no SQL or schema details leak)
 * - body-parser    -> 400 / 413
 * - anything else  -> 500 with a generic message (stack only logged server-side)
 */
// eslint-disable-next-line no-unused-vars
function handleApiError(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    return sendError(res, err.statusCode, err.message, err.statusCode === 422 ? err.details : undefined);
  }

  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return sendError(res, 422, 'Validation failed', errors);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return sendError(res, 409, 'A record with the same unique value already exists');
      case 'P2003':
      case 'P2014':
        return sendError(res, 409, 'Operation conflicts with related records');
      case 'P2025':
        return sendError(res, 404, 'Resource not found');
      case 'P2034':
        return sendError(res, 409, 'Concurrent update detected, please retry');
      default:
        break;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[prisma-validation]', err.message);
    return sendError(res, 422, 'Invalid request data');
  }

  if (err.type === 'entity.too.large') return sendError(res, 413, 'Request body too large');
  if (err.type === 'entity.parse.failed') return sendError(res, 400, 'Malformed JSON body');
  if (err.code === 'CORS_ORIGIN_DENIED') return sendError(res, 403, 'Origin not allowed');

  console.error('[unhandled-error]', env.isProduction ? err.message : err);
  return sendError(res, 500, env.isProduction ? 'Internal server error' : `Internal server error: ${err.message}`);
}

module.exports = { handleApiError, notFoundHandler };
