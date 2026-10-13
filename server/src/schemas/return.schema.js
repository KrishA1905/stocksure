const { z, id, positiveQty, optionalText, withAliases, CONDITION_STATUS } = require('./common.schema');

/**
 * POST /api/returns (coordinator).
 * returnDate and receivedBy are set by the server.
 * Supports partial returns: quantity <= outstanding (checked in the service).
 * Accepts Person 2's `condition` as an alias of `conditionStatus`.
 */
const createReturnSchema = withAliases(
  z
    .object({
      issueLineId: id,
      quantity: positiveQty,
      conditionStatus: CONDITION_STATUS.exclude(['RETIRED']),
      remarks: optionalText(500),
    })
    .strict(),
  { condition: 'conditionStatus' }
);

module.exports = { createReturnSchema };
