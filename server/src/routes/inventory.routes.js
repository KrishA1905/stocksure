// Business logic: Person 2 (services/inventory.service.js). Guards/validation: Person 1.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');
const { validate } = require('../middleware/validate');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { idParam } = require('../schemas/common.schema');
const {
  createItemSchema,
  updateItemSchema,
  listItemsQuery,
  stockAdjustmentSchema,
  restoreStockSchema,
} = require('../schemas/inventory.schema');
const inventory = require('../services/inventory.service');

const router = express.Router();

// GET /api/inventory - any authenticated user (students may browse the catalogue).
router.get(
  '/',
  requireAuth(),
  validate({ query: listItemsQuery }),
  asyncHandler(async (req, res) => sendSuccess(res, await inventory.listItems(req.validatedQuery), 'Inventory list'))
);

// GET /api/inventory/:id - item + assets + recent stock movements.
router.get(
  '/:id',
  requireAuth(),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => sendSuccess(res, await inventory.getItem(req.params.id), 'Inventory item'))
);

// POST /api/inventory - coordinator.
router.post(
  '/',
  requireCoordinator(),
  validate({ body: createItemSchema }),
  asyncHandler(async (req, res) => sendCreated(res, await inventory.createItem(req.body, req), 'Item created'))
);

// PATCH /api/inventory/:id - coordinator (details / active only).
router.patch(
  '/:id',
  requireCoordinator(),
  validate({ params: idParam, body: updateItemSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await inventory.updateItem(req.params.id, req.body, req), 'Item updated'))
);

// POST /api/inventory/:id/adjust - coordinator, QUANTITY items.
router.post(
  '/:id/adjust',
  requireCoordinator(),
  validate({ params: idParam, body: stockAdjustmentSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await inventory.adjustStock(req.params.id, req.body, req), 'Stock adjusted'))
);

// POST /api/inventory/:id/restore - coordinator, QUANTITY items: repaired units back to available.
router.post(
  '/:id/restore',
  requireCoordinator(),
  validate({ params: idParam, body: restoreStockSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await inventory.restoreStock(req.params.id, req.body, req), 'Stock restored'))
);

module.exports = router;
