const ApiError = require('../utils/apiError');
const { ROLES } = require('../config/constants');
const { findActiveUserById } = require('../services/auth.service');

/**
 * requireAuth(): 401 unless the request carries a valid session for an
 * ACTIVE user. Re-reads the user from the DB each request so deactivation or
 * role changes take effect immediately. Sets:
 *   req.user = { id, email, role, studentId|null }
 */
function requireAuth() {
  return async function requireAuthMiddleware(req, res, next) {
    try {
      if (req.user) return next(); // already resolved earlier in this request
      const sessionUserId = req.session && req.session.userId;
      if (!sessionUserId) throw ApiError.unauthorized();

      const user = await findActiveUserById(sessionUserId);
      if (!user) {
        // User deleted/deactivated since login: kill the session.
        await new Promise((resolve) => req.session.destroy(() => resolve()));
        throw ApiError.unauthorized('Session is no longer valid. Please log in again.');
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        studentId: user.student ? user.student.id : null,
        student: user.student || null,
      };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** requireRole('COORDINATOR') / requireRole('STUDENT', 'COORDINATOR'): 401 then 403. */
function requireRole(...roles) {
  const authenticate = requireAuth();
  return function requireRoleMiddleware(req, res, next) {
    authenticate(req, res, (err) => {
      if (err) return next(err);
      if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
      return next();
    });
  };
}

const requireCoordinator = () => requireRole(ROLES.COORDINATOR);
const requireStudent = () => requireRole(ROLES.STUDENT);

/**
 * Ownership guard helper for services/routes:
 *   assertStudentOwnsOrCoordinator(req.user, issue.studentId)
 * Coordinators pass; students pass only for their own studentId.
 * Throws 404 (not 403) so students cannot probe which IDs exist.
 */
function assertStudentOwnsOrCoordinator(user, ownerStudentId) {
  if (user.role === ROLES.COORDINATOR) return;
  if (user.role === ROLES.STUDENT && user.studentId && user.studentId === ownerStudentId) return;
  throw ApiError.notFound();
}

module.exports = {
  requireAuth,
  requireRole,
  requireCoordinator,
  requireStudent,
  assertStudentOwnsOrCoordinator,
};
