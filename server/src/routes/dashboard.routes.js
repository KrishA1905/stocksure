// OWNER: Person 2 (business logic). Guards wired by Person 1.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const notImplemented = require('./_stub');

const router = express.Router();

// GET /api/dashboard - coordinator: department-wide stats; student: own stats only.
router.get('/', requireAuth(), notImplemented('Dashboard'));

module.exports = router;
