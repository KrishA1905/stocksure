// Business logic: Person 2 (services/dashboard.service.js). Guards: Person 1.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { requireAuth } = require('../middleware/auth');
const { getDashboard } = require('../services/dashboard.service');

const router = express.Router();

// GET /api/dashboard - coordinator: department-wide stats; student: own stats only.
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => sendSuccess(res, await getDashboard(req.user), 'Dashboard statistics'))
);

module.exports = router;
