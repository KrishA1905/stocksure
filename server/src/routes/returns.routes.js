// Business logic: Person 2 (services/return.service.js). Guards/validation: Person 1.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { sendCreated } = require('../utils/response');
const { validate } = require('../middleware/validate');
const { requireCoordinator } = require('../middleware/auth');
const { createReturnSchema } = require('../schemas/return.schema');
const { createReturn } = require('../services/return.service');

const router = express.Router();

// POST /api/returns - coordinator only. receivedBy = session user. Partial returns allowed.
router.post(
  '/',
  requireCoordinator(),
  validate({ body: createReturnSchema }),
  asyncHandler(async (req, res) => sendCreated(res, await createReturn(req.body, req), 'Return recorded successfully'))
);

module.exports = router;
