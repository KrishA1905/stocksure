const express = require('express');
const { sendSuccess } = require('../utils/response');
const { ensureCsrfToken } = require('../middleware/csrf');
const prisma = require('../config/prisma');

const router = express.Router();

// --- Public infrastructure endpoints ---
router.get('/health', async (req, res) => {
  let database = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }
  res.status(database === 'up' ? 200 : 503).json({
    success: database === 'up',
    message: database === 'up' ? 'OK' : 'Database unavailable',
    data: { database },
  });
});

router.get('/csrf-token', (req, res) => sendSuccess(res, { csrfToken: ensureCsrfToken(req) }, 'CSRF token'));

// --- Person 1 ---
router.use('/auth', require('./auth.routes'));
router.use('/audit', require('./audit.routes'));
router.use('/students', require('./students.routes'));
router.use('/locations', require('./locations.routes'));

// --- Person 2 ---
router.use('/inventory', require('./inventory.routes'));
router.use('/assets', require('./assets.routes'));
router.use('/issues', require('./issues.routes'));
router.use('/returns', require('./returns.routes'));
router.use('/renewals', require('./renewals.routes'));
router.use('/dashboard', require('./dashboard.routes'));

module.exports = router;
