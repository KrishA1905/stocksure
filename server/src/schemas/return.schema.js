const { z, id, positiveQty, optionalText, CONDITION_STATUS } = require('./common.schema');

/**
 * POST /api/returns (coordinator).
 * returnDate and receivedBy are set by the server.
 * Supports partial returns: quantity <= outstanding (checked in the service).
 */
const createReturnSchema = z
  .object({
    issueLineId: id,
    quantity: positiveQty,
    conditionStatus: CONDITION_STATUS,
    remarks: optionalText(500),
  })
  .strict();

module.exports = { createReturnSchema };
