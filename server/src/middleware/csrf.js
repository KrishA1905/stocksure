const crypto = require('crypto');
const ApiError = require('../utils/apiError');

/**
 * Synchronizer-token CSRF protection for cookie-authenticated requests.
 *
 * Flow (see BACKEND_GUIDE.md):
 *   1. GET /api/csrf-token  -> { data: { csrfToken } }   (token stored in the server session)
 *   2. Send it on every POST/PUT/PATCH/DELETE as header:  X-CSRF-Token: <token>
 *   3. After login the session is regenerated -> use the NEW token returned in
 *      the login response (data.csrfToken) or call GET /api/csrf-token again.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEADER = 'x-csrf-token';

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function rotateCsrfToken(req) {
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function tokensMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function csrfProtection() {
  return function csrfMiddleware(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    const expected = req.session && req.session.csrfToken;
    const provided = req.get(HEADER);
    if (!expected || !tokensMatch(expected, provided)) {
      return next(ApiError.forbidden('Invalid or missing CSRF token'));
    }
    return next();
  };
}

module.exports = { csrfProtection, ensureCsrfToken, rotateCsrfToken, CSRF_HEADER: HEADER };
