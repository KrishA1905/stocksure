// Business logic: Person 2 (services/renewal.service.js). Guards/validation: Person 1.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');
const { validate } = require('../middleware/validate');
const { requireAuth, requireCoordinator, requireStudent } = require('../middleware/auth');
const { idParam } = require('../schemas/common.schema');
const { createRenewalSchema, decideRenewalSchema, listRenewalsQuery } = require('../schemas/renewal.schema');
const renewals = require('../services/renewal.service');

const router = express.Router();

// POST /api/renewals - student, own issue only. Does NOT change the due date.
router.post(
  '/',
  requireStudent(),
  validate({ body: createRenewalSchema }),
  asyncHandler(async (req, res) => sendCreated(res, await renewals.requestRenewal(req.body, req), 'Renewal requested'))
);

// GET /api/renewals - coordinator: all; student: only own.
router.get(
  '/',
  requireAuth(),
  validate({ query: listRenewalsQuery }),
  asyncHandler(async (req, res) => sendSuccess(res, await renewals.listRenewals(req.validatedQuery, req.user), 'Renewals'))
);

// PATCH /api/renewals/:id - coordinator. APPROVED => existing due date + 15 days.
router.patch(
  '/:id',
  requireCoordinator(),
  validate({ params: idParam, body: decideRenewalSchema }),
  asyncHandler(async (req, res) => {
    const result = await renewals.decideRenewal(req.params.id, req.body, req);
    return sendSuccess(res, result, `Renewal ${result.status.toLowerCase()}`);
  })
);

module.exports = router;
