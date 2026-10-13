const { z, id, optionalText, pagination, withAliases, RENEWAL_STATUS } = require('./common.schema');

/** POST /api/renewals (student, own issue only). No due-date fields accepted. */
const createRenewalSchema = z
  .object({
    issueId: id,
    remarks: optionalText(500),
  })
  .strict();

/**
 * PATCH /api/renewals/:id (coordinator). newDueDate is computed by the server.
 * Accepts Person 2's `decision` as an alias of `status`.
 */
const decideRenewalSchema = withAliases(
  z
    .object({
      status: z.enum(['APPROVED', 'REJECTED']),
      remarks: optionalText(500),
    })
    .strict(),
  { decision: 'status' }
);

const listRenewalsQuery = pagination
  .extend({ status: RENEWAL_STATUS.optional() })
  .strict();

module.exports = { createRenewalSchema, decideRenewalSchema, listRenewalsQuery };
