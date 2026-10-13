const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const { sendSuccess } = require('../utils/response');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { rotateCsrfToken } = require('../middleware/csrf');
const { loginSchema } = require('../schemas/auth.schema');
const { verifyCredentials, toPublicUser, findActiveUserById } = require('../services/auth.service');
const { createAuditLog } = require('../services/audit.service');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) =>
    res.status(429).json({ success: false, message: 'Too many login attempts. Try again later.', data: null }),
});

const GENERIC_LOGIN_ERROR = 'Invalid email or password';

const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
const save = (req) => new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
const destroy = (req) => new Promise((resolve, reject) => req.session.destroy((err) => (err ? reject(err) : resolve())));

/**
 * POST /api/auth/login
 * Body: { email, password }   Header: X-CSRF-Token
 */
router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { user, userId, reason } = await verifyCredentials(email, password);

    if (!user) {
      await createAuditLog({
        userId,
        action: AUDIT_ACTIONS.LOGIN_FAILURE,
        entityType: ENTITY_TYPES.USER,
        entityId: userId,
        metadata: { email, reason },
        req,
      });
      throw ApiError.unauthorized(GENERIC_LOGIN_ERROR);
    }

    // Session fixation defence: brand-new session ID after authentication.
    await regenerate(req);
    req.session.userId = user.id;
    req.session.role = user.role; // informational only; authZ always re-reads the DB
    req.session.loginAt = new Date().toISOString();
    const csrfToken = rotateCsrfToken(req);
    await save(req);

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      req,
    });

    const fresh = await findActiveUserById(user.id);
    return sendSuccess(res, { ...toPublicUser(fresh), csrfToken }, 'Login successful');
  })
);

/**
 * POST /api/auth/logout   Header: X-CSRF-Token
 * Idempotent: succeeds even if the session already expired.
 */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const userId = req.session && req.session.userId;
    if (userId) {
      await createAuditLog({ userId, action: AUDIT_ACTIONS.LOGOUT, entityType: ENTITY_TYPES.USER, entityId: userId, req });
    }
    if (req.session) await destroy(req);
    res.clearCookie(req.app.get('sessionCookieName'), req.app.get('sessionCookieClearOptions'));
    return sendSuccess(res, null, 'Logged out');
  })
);

/** GET /api/auth/me -> current user (401 if not logged in). */
router.get(
  '/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = await findActiveUserById(req.user.id);
    return sendSuccess(res, toPublicUser(user), 'Authenticated user');
  })
);

module.exports = router;
