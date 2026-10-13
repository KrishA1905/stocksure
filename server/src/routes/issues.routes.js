// Business logic: Person 2 (services/issue.service.js). Guards/validation: Person 1.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');
const { validate } = require('../middleware/validate');
const { requireAuth, requireCoordinator, requireStudent } = require('../middleware/auth');
const { idParam } = require('../schemas/common.schema');
const { createIssueSchema, listIssuesQuery } = require('../schemas/issue.schema');
const issues = require('../services/issue.service');

const router = express.Router();

// POST /api/issues - coordinator only. issuedBy = session user; due date = server.
router.post(
  '/',
  requireCoordinator(),
  validate({ body: createIssueSchema }),
  asyncHandler(async (req, res) => sendCreated(res, await issues.createIssue(req.body, req), 'Items issued successfully'))
);

// GET /api/issues - coordinator, all issues (filters: studentId, status, overdue, search).
router.get(
  '/',
  requireCoordinator(),
  validate({ query: listIssuesQuery }),
  asyncHandler(async (req, res) => sendSuccess(res, await issues.listIssues(req.validatedQuery), 'Issues'))
);

// GET /api/issues/overdue - coordinator, one row per overdue line (Person 2 report).
router.get(
  '/overdue',
  requireCoordinator(),
  asyncHandler(async (req, res) => sendSuccess(res, await issues.getOverdueLines(), 'Overdue items'))
);

// GET /api/issues/mine - student, ONLY their own issues. Declared before '/:id'.
router.get(
  '/mine',
  requireStudent(),
  asyncHandler(async (req, res) => sendSuccess(res, await issues.listMyIssues(req.user), 'Your issues'))
);

// GET /api/issues/:id - coordinator any; student only own (others -> 404).
router.get(
  '/:id',
  requireAuth(),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => sendSuccess(res, await issues.getIssue(req.params.id, req.user), 'Issue'))
);

module.exports = router;
