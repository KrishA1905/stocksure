// OWNER: Person 2 (business logic). Guards/validation wired by Person 1.
const express = require('express');
const { validate } = require('../middleware/validate');
const { requireAuth, requireCoordinator, requireStudent } = require('../middleware/auth');
const { idParam } = require('../schemas/common.schema');
const { createIssueSchema, listIssuesQuery } = require('../schemas/issue.schema');
const notImplemented = require('./_stub');

const router = express.Router();

// POST /api/issues - coordinator only.
// Use runInTransaction + calculateDueDate(now) + createAuditLog(ISSUE_CREATED, tx).
// issuedById = req.user.id (never from body).
router.post('/', requireCoordinator(), validate({ body: createIssueSchema }), notImplemented('Create issue'));

// GET /api/issues - coordinator, all issues (filters: studentId, status, overdue).
router.get('/', requireCoordinator(), validate({ query: listIssuesQuery }), notImplemented('List issues'));

// GET /api/issues/mine - student, ONLY issues where studentId = req.user.studentId.
// MUST be declared before '/:id'.
router.get('/mine', requireStudent(), notImplemented('My issues'));

// GET /api/issues/:id - coordinator any; student only own (use assertStudentOwnsOrCoordinator -> 404).
router.get('/:id', requireAuth(), validate({ params: idParam }), notImplemented('Get issue'));

module.exports = router;
