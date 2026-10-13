// Shared backend utilities (Person 1). Person 2 should import from here.
const ApiError = require('./apiError');
const asyncHandler = require('./asyncHandler');
const { sendSuccess, sendCreated, sendError } = require('./response');
const { addDays, calculateDueDate, calculateRenewedDueDate, daysOverdue, isOverdue } = require('./dates');
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
  addDays,
  calculateDueDate,
  calculateRenewedDueDate,
  daysOverdue,
  isOverdue,
  runInTransaction,
  paginate,
  getAuthenticatedUser,
  getStudentFromUser,
  createAuditLog,
  requireCoordinator,
  handleApiError,
};
