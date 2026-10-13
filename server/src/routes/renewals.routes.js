// OWNER: Person 2 (business logic). Guards/validation wired by Person 1.
const express = require('express');
const { validate } = require('../middleware/validate');
const { requireAuth, requireCoordinator, requireStudent } = require('../middleware/auth');
const { idParam } = require('../schemas/common.schema');
const { createRenewalSchema, decideRenewalSchema, listRenewalsQuery } = require('../schemas/renewal.schema');
const notImplemented = require('./_stub');

const router = express.Router();

// POST /api/renewals - student, own issue only (issue.studentId === req.user.studentId, else 404).
// Creates PENDING renewal with oldDueDate = issue.dueDate. MUST NOT change issue.dueDate.
// Audit: RENEWAL_REQUESTED.
router.post('/', requireStudent(), validate({ body: createRenewalSchema }), notImplemented('Request renewal'));

// GET /api/renewals - coordinator: all; student: only own (filter by req.user.studentId).
router.get('/', requireAuth(), validate({ query: listRenewalsQuery }), notImplemented('List renewals'));

// PATCH /api/renewals/:id - coordinator. Only PENDING can be decided.
// APPROVED: issue.dueDate = calculateRenewedDueDate(issue.dueDate) in a transaction.
// REJECTED: due date unchanged. Audit: RENEWAL_APPROVED / RENEWAL_REJECTED.
router.patch(
  '/:id',
  requireCoordinator(),
  validate({ params: idParam, body: decideRenewalSchema }),
  notImplemented('Decide renewal')
);

module.exports = router;
