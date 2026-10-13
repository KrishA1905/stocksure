const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');

// Hash of a random string; compared against when the email does not exist so
// response time does not reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync(require('crypto').randomBytes(16).toString('hex'), 10);

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  active: true,
  student: {
    select: { id: true, name: true, enrollmentNo: true, programme: true, semester: true },
  },
};

/** Strip anything not meant for the client (never passwordHash). */
function toPublicUser(user) {
  if (!user) return null;
  const pub = { id: user.id, email: user.email, role: user.role };
  if (user.student) pub.student = user.student;
  return pub;
}

/**
 * Returns { user } on success, or { user: null, reason } on ANY failure
 * (unknown email, wrong password, inactive account). The reason is for the
 * audit log only - the HTTP response must stay generic.
 */
async function verifyCredentials(email, password) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user) return { user: null, userId: null, reason: 'UNKNOWN_EMAIL' };
  if (!ok) return { user: null, userId: user.id, reason: 'BAD_PASSWORD' };
  if (!user.active) return { user: null, userId: user.id, reason: 'INACTIVE' };
  return { user, userId: user.id, reason: null };
}

/** Fresh DB lookup of the session user (role/active can change mid-session). */
async function findActiveUserById(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
  if (!user || !user.active) return null;
  return user;
}

/**
 * Identity helper #1: the authenticated user for this request.
 * Populated by requireAuth(); throws 401 if absent.
 */
function getAuthenticatedUser(req) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

/**
 * Identity helper #2: the Student row linked to a user (session-derived).
 * Never accept a studentId from the client to identify "me".
 */
async function getStudentFromUser(userOrId, db = prisma) {
  const userId = typeof userOrId === 'object' ? userOrId.id : userOrId;
  const student = await db.student.findUnique({ where: { userId } });
  if (!student) throw ApiError.forbidden('No student profile is linked to this account');
  return student;
}

module.exports = {
  SAFE_USER_SELECT,
  toPublicUser,
  verifyCredentials,
  findActiveUserById,
  getAuthenticatedUser,
  getStudentFromUser,
};
