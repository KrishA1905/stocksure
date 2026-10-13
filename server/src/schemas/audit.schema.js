const { z, id, pagination } = require('./common.schema');

const listAuditQuery = pagination
  .extend({
    action: z.string().trim().max(60).regex(/^[A-Z_]+$/, 'Invalid action').optional(),
    entityType: z.string().trim().max(60).regex(/^[A-Z_]+$/, 'Invalid entity type').optional(),
    entityId: z.string().trim().max(60).optional(),
    userId: id.optional(),
  })
  .strict();

module.exports = { listAuditQuery };
