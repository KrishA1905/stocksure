const prisma = require('../config/prisma');

/**
 * Run a stock/due-date changing workflow inside ONE Prisma interactive
 * transaction. If the callback throws (ApiError or anything else) every write
 * inside it is rolled back - stock, due dates and audit rows alike.
 *
 * Required pattern (Person 2):
 *
 *   const result = await runInTransaction(async (tx) => {
 *     // 1. read required records         (tx.issue.findUnique ...)
 *     // 2. verify authorization/ownership (throw ApiError.forbidden())
 *     // 3. verify availability            (throw ApiError.conflict())
 *     // 4. modify records                 (prefer conditional updateMany, check .count)
 *     // 5. createAuditLog({...}, tx)      (same transaction!)
 *     return created;
 *   });
 *
 * Always use `tx` (never the global `prisma`) inside the callback.
 */
function runInTransaction(fn, options = {}) {
  return prisma.$transaction(fn, {
    maxWait: 5000,
    timeout: 10000,
    ...options,
  });
}

module.exports = { runInTransaction };
