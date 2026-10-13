const { z, id, positiveQty, optionalText, pagination, boolFromQuery, withAliases, ISSUE_STATUS } = require('./common.schema');

/**
 * POST /api/issues (coordinator).
 * NOTE: no issueDate / dueDate / issuedBy fields - the server sets them.
 * .strict() rejects them if a client tries to send them.
 *
 * Line rules:
 *  - INDIVIDUAL item -> assetId required, quantity must be 1 (default 1)
 *  - QUANTITY item   -> assetId omitted, quantity >= 1
 *  (The tracking-mode check needs the DB, so the service enforces it.)
 *
 * Accepts Person 2's field name `items` as an alias of `lines`.
 */
const issueLineSchema = z
  .object({
    itemId: id,
    assetId: id.optional().nullable(),
    quantity: positiveQty.default(1),
  })
  .strict()
  .refine((l) => !l.assetId || l.quantity === 1, {
    message: 'Individually tracked assets must be issued with quantity 1',
    path: ['quantity'],
  });

const createIssueSchema = withAliases(
  z
    .object({
      studentId: id,
      purpose: optionalText(255),
      lines: z
        .array(issueLineSchema)
        .min(1, 'At least one item line is required')
        .max(50, 'Too many lines in one issue')
        .refine((lines) => {
          const assets = lines.filter((l) => l.assetId).map((l) => l.assetId);
          return new Set(assets).size === assets.length;
        }, 'The same asset appears twice in this issue'),
    })
    .strict(),
  { items: 'lines' }
);

const listIssuesQuery = pagination
  .extend({
    studentId: id.optional(),
    status: ISSUE_STATUS.optional(),
    overdue: boolFromQuery.optional(),
    search: z.string().trim().max(100).optional(),
  })
  .strict();

module.exports = { createIssueSchema, issueLineSchema, listIssuesQuery };
