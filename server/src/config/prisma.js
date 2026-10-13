const { PrismaClient } = require('@prisma/client');
const env = require('./env');

// Single shared Prisma client for the whole process.
const prisma = new PrismaClient({
  log: env.isProduction ? ['error'] : ['warn', 'error'],
});

module.exports = prisma;
