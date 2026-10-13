const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { validate } = require('../middleware/validate');
const { requireCoordinator } = require('../middleware/auth');
const { listAuditQuery } = require('../schemas/audit.schema');
const { listAuditLogs } = require('../services/audit.service');

const router = express.Router();

// Read-only. There are intentionally NO create/update/delete audit endpoints.
router.get(
  '/',
  requireCoordinator(),
  validate({ query: listAuditQuery }),
  asyncHandler(async (req, res) => {
    const result = await listAuditLogs(req.validatedQuery);
    return sendSuccess(res, result, 'Audit logs');
  })
);

module.exports = router;
