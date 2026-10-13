const { z, id, optionalText, pagination, RENEWAL_STATUS } = require('./common.schema');

/** POST /api/renewals (student, own issue only). No due-date fields accepted. */
const createRenewalSchema = z
  .object({
    issueId: id,
    remarks: optionalText(500),
  })
  .strict();

/** PATCH /api/renewals/:id (coordinator). newDueDate is computed by the server. */
const decideRenewalSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    remarks: optionalText(500),
  })
  .strict();

const listRenewalsQuery = pagination
  .extend({ status: RENEWAL_STATUS.optional() })
  .strict();

module.exports = { createRenewalSchema, decideRenewalSchema, listRenewalsQuery };
