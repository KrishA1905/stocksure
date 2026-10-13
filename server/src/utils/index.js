// Shared backend utilities (Person 1). Person 2 should import from here.
const ApiError = require('./apiError');
const asyncHandler = require('./asyncHandler');
const { sendSuccess, sendCreated, sendError } = require('./response');
const dates = require('./dates');
const { runInTransaction } = require('./transaction');
const { paginate } = require('./pagination');
const { getAuthenticatedUser, getStudentFromUser } = require('../services/auth.service');
const { createAuditLog } = require('../services/audit.service');
const { requireCoordinator } = require('../middleware/auth');
const { handleApiError } = require('../middleware/errorHandler');

module.exports = {
  ApiError,
  asyncHandler,
  sendSuccess,
  sendCreated,
  sendError,
  ...dates,
  runInTransaction,
  paginate,
  getAuthenticatedUser,
  getStudentFromUser,
  createAuditLog,
  requireCoordinator,
  handleApiError,
};
