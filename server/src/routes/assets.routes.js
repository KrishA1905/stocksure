// OWNER: Person 2 (business logic). Guards/validation wired by Person 1.
const express = require('express');
const { validate } = require('../middleware/validate');
const { requireCoordinator } = require('../middleware/auth');
const { idParam } = require('../schemas/common.schema');
const { createAssetSchema, updateAssetSchema, listAssetsQuery } = require('../schemas/inventory.schema');
const notImplemented = require('./_stub');

const router = express.Router();

// GET /api/assets - coordinator. available=true => USABLE && active && !isIssued
router.get('/', requireCoordinator(), validate({ query: listAssetsQuery }), notImplemented('List assets'));

// POST /api/assets - coordinator. Item must be INDIVIDUAL; bump totalQuantity/availableQuantity. Audit: ASSET_CREATED
router.post('/', requireCoordinator(), validate({ body: createAssetSchema }), notImplemented('Create asset'));

// PATCH /api/assets/:id - coordinator. Condition change => Audit: ASSET_STATUS_CHANGED.
// Restoring DAMAGED/LOST/MAINTENANCE -> USABLE is the explicit coordinator restore step.
router.patch('/:id', requireCoordinator(), validate({ params: idParam, body: updateAssetSchema }), notImplemented('Update asset'));

module.exports = router;
