// Business logic: Person 2 (services/asset.service.js). Guards/validation: Person 1.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');
const { validate } = require('../middleware/validate');
const { requireCoordinator } = require('../middleware/auth');
const { idParam } = require('../schemas/common.schema');
const { createAssetSchema, updateAssetSchema, listAssetsQuery } = require('../schemas/inventory.schema');
const assets = require('../services/asset.service');

const router = express.Router();

// GET /api/assets - coordinator. available=true => USABLE && active && !isIssued
router.get(
  '/',
  requireCoordinator(),
  validate({ query: listAssetsQuery }),
  asyncHandler(async (req, res) => sendSuccess(res, await assets.listAssets(req.validatedQuery), 'Assets'))
);

// POST /api/assets - coordinator. Item must be INDIVIDUAL.
router.post(
  '/',
  requireCoordinator(),
  validate({ body: createAssetSchema }),
  asyncHandler(async (req, res) => sendCreated(res, await assets.createAsset(req.body, req), 'Asset created'))
);

// PATCH /api/assets/:id - coordinator. Setting conditionStatus back to USABLE = restore.
router.patch(
  '/:id',
  requireCoordinator(),
  validate({ params: idParam, body: updateAssetSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await assets.updateAsset(req.params.id, req.body, req), 'Asset updated'))
);

module.exports = router;
