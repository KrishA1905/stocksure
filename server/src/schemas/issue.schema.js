const { z, id, positiveQty, pagination, boolFromQuery, ISSUE_STATUS } = require('./common.schema');

/**
 * POST /api/issues (coordinator).
 * NOTE: no issueDate / dueDate / issuedBy fields - the server sets them.
 * .strict() rejects them if a client tries to send them.
 *
 * Line rules:
 *  - INDIVIDUAL item -> assetId required, quantity must be 1 (default 1)
 *  - QUANTITY item   -> assetId omitted, quantity >= 1
 *  (The tracking-mode check needs the DB, so Person 2 enforces it in the service.)
 */
const issueLineSchema = z
  .object({
    itemId: id,
    assetId: id.optional(),
    quantity: positiveQty.default(1),
  })
  .strict()
  .refine((l) => !l.assetId || l.quantity === 1, {
    message: 'Individually tracked assets must be issued with quantity 1',
    path: ['quantity'],
  });

const createIssueSchema = z
  .object({
    studentId: id,
    lines: z
      .array(issueLineSchema)
      .min(1, 'At least one item line is required')
      .max(50, 'Too many lines in one issue')
      .refine((lines) => {
        const tags = lines.filter((l) => l.assetId).map((l) => l.assetId);
        return new Set(tags).size === tags.length;
      }, 'The same asset appears twice in this issue'),
  })
  .strict();

const listIssuesQuery = pagination
  .extend({
    studentId: id.optional(),
    status: ISSUE_STATUS.optional(),
    overdue: boolFromQuery.optional(),
  })
  .strict();

module.exports = { createIssueSchema, issueLineSchema, listIssuesQuery };
