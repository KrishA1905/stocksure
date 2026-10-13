// OWNER: Person 2 (business logic) - integrated into the shared backend by Person 1.
const ApiError = require('../utils/apiError');
const { runInTransaction } = require('../utils/transaction');
const { createAuditLog } = require('./audit.service');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');
const { lockRows, syncIndividualCounts } = require('./stock.helpers');
const { computeIssueStatus } = require('./issue.service');

/**
 * POST /api/returns - full or partial return of one issue line.
 *
 * USABLE      -> units go back on the shelf / asset becomes issuable again.
 * DAMAGED | MAINTENANCE | LOST
 *             -> QUANTITY: units move to unavailableQuantity (restore later
 *                via POST /api/inventory/:id/restore)
 *             -> INDIVIDUAL: asset keeps that condition and stays
 *                unavailable until a coordinator sets it back to USABLE.
 */
async function createReturn({ issueLineId, quantity, conditionStatus, remarks }, req) {
  return runInTransaction(
    async (tx) => {
      // 1. Lock the issue line, then its item and asset (Person 2's lock order).
      await lockRows(tx, 'issueLine', [issueLineId]);
      const line = await tx.issueLine.findUnique({
        where: { id: issueLineId },
        include: { item: true, asset: true, issue: { include: { student: { select: { id: true, name: true, enrollmentNo: true } } } } },
      });
      if (!line) throw ApiError.notFound('Issue line not found');

      const outstanding = line.quantity - line.returnedQuantity;
      if (outstanding <= 0) throw ApiError.conflict(`${line.item.name} on issue #${line.issueId} is already fully returned`);
      if (quantity > outstanding) {
        throw ApiError.conflict(`Return quantity ${quantity} exceeds outstanding ${outstanding} for "${line.item.name}"`);
      }

      await lockRows(tx, 'item', [line.itemId]);
      if (line.assetId) await lockRows(tx, 'asset', [line.assetId]);

      // 2. Receipt + condition are recorded first...
      const record = await tx.returnRecord.create({
        data: { issueLineId: line.id, quantity, conditionStatus, receivedById: req.user.id, remarks: remarks || null },
      });
      await tx.issueLine.update({ where: { id: line.id }, data: { returnedQuantity: { increment: quantity } } });

      // 3. ...and only then does availability change.
      const usable = conditionStatus === 'USABLE';
      if (line.assetId) {
        await tx.asset.update({ where: { id: line.assetId }, data: { isIssued: false, conditionStatus } });
        await syncIndividualCounts(tx, line.itemId);
      } else {
        await tx.item.update({
          where: { id: line.itemId },
          data: usable ? { availableQuantity: { increment: quantity } } : { unavailableQuantity: { increment: quantity } },
        });
      }
      await tx.stockMovement.create({
        data: {
          itemId: line.itemId,
          movementType: 'RETURN',
          quantityDelta: quantity,
          reason: `Return on issue #${line.issueId}${line.asset ? ` (${line.asset.assetTag})` : ''}: ${conditionStatus}`,
          createdById: req.user.id,
        },
      });

      // 4. Issue status (ACTIVE / PARTIALLY_RETURNED / RETURNED).
      const allLines = await tx.issueLine.findMany({ where: { issueId: line.issueId } });
      const issueStatus = computeIssueStatus(allLines);
      await tx.issue.update({ where: { id: line.issueId }, data: { status: issueStatus } });

      // A fully returned issue no longer needs a pending renewal.
      if (issueStatus === 'RETURNED') {
        await tx.renewal.updateMany({
          where: { issueId: line.issueId, status: 'PENDING' },
          data: { status: 'REJECTED', approvedById: req.user.id, approvedAt: new Date(), decisionRemarks: 'Closed automatically: all items returned' },
        });
      }

      const updated = allLines.find((l) => l.id === line.id);
      const outstandingAfter = updated.quantity - updated.returnedQuantity;

      // 5. Audit.
      await createAuditLog(
        {
          action: AUDIT_ACTIONS.RETURN_CREATED,
          entityType: ENTITY_TYPES.RETURN,
          entityId: record.id,
          metadata: {
            issueId: line.issueId,
            issueLineId: line.id,
            itemId: line.itemId,
            assetTag: line.asset ? line.asset.assetTag : null,
            quantity,
            conditionStatus,
            remarks: remarks || null,
            outstandingAfter,
          },
          req,
        },
        tx
      );

      return {
        return: record,
        issueLine: {
          id: updated.id,
          item: { id: line.item.id, name: line.item.name, trackingMode: line.item.trackingMode },
          asset: line.asset ? { id: line.asset.id, assetTag: line.asset.assetTag, conditionStatus } : null,
          quantity: updated.quantity,
          returnedQuantity: updated.returnedQuantity,
          outstandingQuantity: outstandingAfter,
        },
        issueId: line.issueId,
        issueStatus,
        student: line.issue.student,
      };
    },
    { timeout: 15000 }
  );
}

module.exports = { createReturn };
