const express = require('express');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');
const { validate } = require('../middleware/validate');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { createLocationSchema } = require('../schemas/inventory.schema');

const router = express.Router();

/** GET /api/locations (any authenticated user) - for filters/dropdowns. */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const items = await prisma.location.findMany({ orderBy: [{ department: 'asc' }, { laboratory: 'asc' }, { room: 'asc' }] });
    return sendSuccess(res, items, 'Locations');
  })
);

/** POST /api/locations (coordinator). */
router.post(
  '/',
  requireCoordinator(),
  validate({ body: createLocationSchema }),
  asyncHandler(async (req, res) => {
    const location = await prisma.location.create({ data: req.body });
    return sendCreated(res, location, 'Location created');
  })
);

module.exports = router;
