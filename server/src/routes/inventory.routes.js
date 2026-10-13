// OWNER: Person 2 (business logic). Guards/validation wired by Person 1.
const express = require('express');
const { validate } = require('../middleware/validate');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { idParam } = require('../schemas/common.schema');
const { createItemSchema, updateItemSchema, listItemsQuery, stockAdjustmentSchema } = require('../schemas/inventory.schema');
const notImplemented = require('./_stub');

const router = express.Router();

// GET /api/inventory - any authenticated user (students may browse the catalogue).
// Query (req.validatedQuery): search, category, trackingMode, active, available, locationId, page, pageSize
router.get('/', requireAuth(), validate({ query: listItemsQuery }), notImplemented('List inventory'));

// GET /api/inventory/:id
router.get('/:id', requireAuth(), validate({ params: idParam }), notImplemented('Get inventory item'));

// POST /api/inventory - coordinator. Audit: ITEM_CREATED (+ StockMovement INITIAL for QUANTITY items)
router.post('/', requireCoordinator(), validate({ body: createItemSchema }), notImplemented('Create inventory item'));

// PATCH /api/inventory/:id - coordinator. Audit: ITEM_UPDATED
router.patch('/:id', requireCoordinator(), validate({ params: idParam, body: updateItemSchema }), notImplemented('Update inventory item'));

// POST /api/inventory/:id/adjust - coordinator. Transaction + StockMovement + Audit: STOCK_ADJUSTED
router.post(
  '/:id/adjust',
  requireCoordinator(),
  validate({ params: idParam, body: stockAdjustmentSchema }),
  notImplemented('Stock adjustment')
);

module.exports = router;
