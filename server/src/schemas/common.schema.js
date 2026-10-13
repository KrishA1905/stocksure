const { z } = require('zod');

// Reusable building blocks. IDs are positive auto-increment integers.
const id = z.coerce
  .number({ invalid_type_error: 'Must be a numeric ID' })
  .int('Must be a whole number')
  .positive('Must be a positive ID')
  .max(2147483647, 'ID out of range');

const idParam = z.object({ id }).strict();

const trimmed = (max, min = 1) => z.string().trim().min(min, `Must be at least ${min} character(s)`).max(max, `Must be at most ${max} characters`);
const optionalText = (max) => z.string().trim().max(max, `Must be at most ${max} characters`).optional().nullable();

// Strictly positive quantity (issue/return). Zero and negatives rejected.
const positiveQty = z.coerce.number().int('Quantity must be a whole number').positive('Quantity must be greater than 0').max(100000);

// Signed, non-zero delta (stock adjustments).
const nonZeroDelta = z.coerce
  .number()
  .int()
  .min(-100000)
  .max(100000)
  .refine((n) => n !== 0, 'Quantity delta cannot be 0');

const isoDate = z.coerce.date({ errorMap: () => ({ message: 'Invalid date' }) });

const boolFromQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Accepts alternative field names (e.g. Person 2's `items`, `condition`,
 * `decision`) and renames them to the canonical contract names BEFORE the
 * strict schema runs. If both are sent, the canonical one wins.
 */
function withAliases(schema, aliases) {
  return z.preprocess((input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    const out = { ...input };
    for (const [alias, canonical] of Object.entries(aliases)) {
      if (alias in out) {
        if (!(canonical in out)) out[canonical] = out[alias];
        delete out[alias];
      }
    }
    return out;
  }, schema);
}

const ROLE = z.enum(['STUDENT', 'COORDINATOR']);
const TRACKING_MODE = z.enum(['INDIVIDUAL', 'QUANTITY']);
const CONDITION_STATUS = z.enum(['USABLE', 'DAMAGED', 'LOST', 'MAINTENANCE', 'RETIRED']);
const RENEWAL_STATUS = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
const ISSUE_STATUS = z.enum(['ACTIVE', 'PARTIALLY_RETURNED', 'RETURNED']);

module.exports = {
  z,
  id,
  idParam,
  trimmed,
  optionalText,
  positiveQty,
  nonZeroDelta,
  isoDate,
  boolFromQuery,
  pagination,
  withAliases,
  ROLE,
  TRACKING_MODE,
  CONDITION_STATUS,
  RENEWAL_STATUS,
  ISSUE_STATUS,
};
