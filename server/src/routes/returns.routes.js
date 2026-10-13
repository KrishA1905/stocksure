// OWNER: Person 2 (business logic). Guards/validation wired by Person 1.
const express = require('express');
const { validate } = require('../middleware/validate');
const { requireCoordinator } = require('../middleware/auth');
const { createReturnSchema } = require('../schemas/return.schema');
const notImplemented = require('./_stub');

const router = express.Router();

// POST /api/returns - coordinator only. receivedById = req.user.id.
// Transaction: quantity <= (quantity - returnedQuantity); record condition;
// only USABLE returns go back to availability; Audit: RETURN_CREATED.
router.post('/', requireCoordinator(), validate({ body: createReturnSchema }), notImplemented('Create return'));

module.exports = router;
