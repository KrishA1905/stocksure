// OWNER: Person 2 (business logic) - integrated into the shared backend by Person 1.
const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const { paginate } = require('../utils/pagination');
const { runInTransaction } = require('../utils/transaction');
const { calculateDueDate, isOverdue, daysOverdue, daysUntilDue, toCalendarDate, startOfCalendarDay } = require('../utils/dates');
const { createAuditLog } = require('./audit.service');
const { assertStudentOwnsOrCoordinator } = require('../middleware/auth');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');
const { lockRows, syncIndividualCounts } = require('./stock.helpers');

const ISSUE_INCLUDE = {
  student: { select: { id: true, name: true, enrollmentNo: true, programme: true } },
  issuedBy: { select: { id: true, email: true } },
  lines: {
    orderBy: { id: 'asc' },
    include: {
      item: { select: { id: true, name: true, itemCode: true, trackingMode: true, category: true } },
      asset: { select: { id: true, assetTag: true, serialNumber: true, conditionStatus: true } },
      returns: {
        orderBy: { returnDate: 'asc' },
        select: { id: true, quantity: true, returnDate: true, conditionStatus: true, remarks: true, receivedBy: { select: { email: true } } },
      },
    },
  },
  renewals: {
    orderBy: { requestedAt: 'desc' },
    select: { id: true, status: true, requestedAt: true, oldDueDate: true, newDueDate: true, approvedAt: true, remarks: true },
  },
};

/** Adds server-authoritative outstanding / overdue figures for the UI. */
function presentIssue(issue, now = new Date()) {
  const overdueNow = isOverdue(issue.dueDate, now);
  const lines = issue.lines.map((l) => {
    const outstandingQuantity = l.quantity - l.returnedQuantity;
    return {
      ...l,
      // Person 2 field names kept for convenience
      itemName: l.item.name,
      assetTag: l.asset ? l.asset.assetTag : null,
      outstandingQuantity,
      outstanding: outstandingQuantity,
      isOverdue: outstandingQuantity > 0 && overdueNow,
    };
  });
  const outstanding = lines.reduce((s, l) => s + l.outstandingQuantity, 0);
  const overdue = outstanding > 0 && overdueNow;
  const pendingRenewal = issue.renewals.find((r) => r.status === 'PENDING') || null;
  return {
    ...issue,
    lines,
    issueCalendarDate: toCalendarDate(issue.issueDate),
    dueCalendarDate: toCalendarDate(issue.dueDate),
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    outstandingQuantity: outstanding,
    isOverdue: overdue,
    overdueDays: overdue ? daysOverdue(issue.dueDate, now) : 0,
    daysUntilDue: outstanding > 0 ? daysUntilDue(issue.dueDate, now) : null,
    displayStatus: overdue ? 'OVERDUE' : issue.status,
    pendingRenewal,
    canRequestRenewal: outstanding > 0 && !pendingRenewal && !overdueNow,
  };
}

function computeIssueStatus(lines) {
  if (lines.every((l) => l.returnedQuantity >= l.quantity)) return 'RETURNED';
  if (lines.some((l) => l.returnedQuantity > 0)) return 'PARTIALLY_RETURNED';
  return 'ACTIVE';
}

/**
 * POST /api/issues - one atomic transaction (Person 2's algorithm):
 *  1. verify the student      2. lock items, then assets (ascending ids)
 *  3. validate EVERY line before writing anything
 *  4. create issue + lines, move stock, claim assets   5. audit
 * Any failure rolls everything back.
 */
async function createIssue({ studentId, purpose, lines }, req) {
  const created = await runInTransaction(
    async (tx) => {
      const student = await tx.student.findUnique({ where: { id: studentId }, include: { user: { select: { active: true } } } });
      if (!student || !student.user.active) throw ApiError.notFound('Student not found or not active');

      const itemIds = lines.map((l) => l.itemId);
      const assetIds = lines.filter((l) => l.assetId).map((l) => l.assetId);
      await lockRows(tx, 'item', itemIds);
      await lockRows(tx, 'asset', assetIds);

      const [items, assets] = await Promise.all([
        tx.item.findMany({ where: { id: { in: itemIds } } }),
        assetIds.length ? tx.asset.findMany({ where: { id: { in: assetIds } } }) : [],
      ]);
      const itemMap = new Map(items.map((i) => [i.id, i]));
      const assetMap = new Map(assets.map((a) => [a.id, a]));

      // Validate all lines first. Quantity requests are summed per item so two
      // lines for the same item cannot together exceed the available stock.
      const requestedPerItem = new Map();
      lines.forEach((line, index) => {
        const item = itemMap.get(line.itemId);
        const where = `Line ${index + 1}`;
        if (!item) throw ApiError.notFound(`${where}: item ${line.itemId} not found`);
        if (!item.active) throw ApiError.conflict(`${item.name} is inactive and cannot be issued`);

        if (item.trackingMode === 'INDIVIDUAL') {
          if (!line.assetId) {
            throw ApiError.validation('Validation failed', [{ field: `body.lines.${index}.assetId`, message: `${item.name} is tracked individually - pick a specific asset` }]);
          }
          if (line.quantity !== 1) {
            throw ApiError.validation('Validation failed', [{ field: `body.lines.${index}.quantity`, message: `${item.name} must be issued with quantity 1` }]);
          }
          const asset = assetMap.get(line.assetId);
          if (!asset) throw ApiError.notFound(`${where}: asset ${line.assetId} not found`);
          if (asset.itemId !== item.id) {
            throw ApiError.validation('Validation failed', [{ field: `body.lines.${index}.assetId`, message: `${asset.assetTag} does not belong to ${item.name}` }]);
          }
          if (!asset.active) throw ApiError.conflict(`Asset "${asset.assetTag}" is inactive`);
          if (asset.isIssued) throw ApiError.conflict(`Asset "${asset.assetTag}" is already issued`);
          if (asset.conditionStatus !== 'USABLE') {
            throw ApiError.conflict(`Asset "${asset.assetTag}" is not usable (condition: ${asset.conditionStatus})`);
          }
        } else {
          if (line.assetId) {
            throw ApiError.validation('Validation failed', [{ field: `body.lines.${index}.assetId`, message: `${item.name} is quantity-tracked - send a quantity, not an asset` }]);
          }
          requestedPerItem.set(item.id, (requestedPerItem.get(item.id) || 0) + line.quantity);
        }
      });
      for (const [itemId, requested] of requestedPerItem) {
        const item = itemMap.get(itemId);
        if (requested > item.availableQuantity) {
          throw ApiError.conflict(`Insufficient stock for "${item.name}": requested ${requested}, available ${item.availableQuantity}`);
        }
      }

      // Write phase.
      const issueDate = new Date();
      const issue = await tx.issue.create({
        data: { studentId, issueDate, dueDate: calculateDueDate(issueDate), issuedById: req.user.id, purpose: purpose || null },
      });

      const touchedIndividual = new Set();
      for (const line of lines) {
        const item = itemMap.get(line.itemId);
        await tx.issueLine.create({
          data: { issueId: issue.id, itemId: item.id, assetId: line.assetId ?? null, quantity: line.quantity },
        });

        if (item.trackingMode === 'INDIVIDUAL') {
          // Guarded claim (defence in depth on top of the row lock).
          const claim = await tx.asset.updateMany({
            where: { id: line.assetId, itemId: item.id, active: true, conditionStatus: 'USABLE', isIssued: false },
            data: { isIssued: true },
          });
          if (claim.count !== 1) throw ApiError.conflict(`Asset ${line.assetId} was taken by another request`);
          touchedIndividual.add(item.id);
        } else {
          const dec = await tx.item.updateMany({
            where: { id: item.id, availableQuantity: { gte: line.quantity } },
            data: { availableQuantity: { decrement: line.quantity } },
          });
          if (dec.count !== 1) throw ApiError.conflict(`Insufficient stock for "${item.name}"`);
        }

        await tx.stockMovement.create({
          data: { itemId: item.id, movementType: 'ISSUE', quantityDelta: -line.quantity, reason: `Issue #${issue.id}`, createdById: req.user.id },
        });
      }
      for (const itemId of touchedIndividual) await syncIndividualCounts(tx, itemId);

      await createAuditLog(
        {
          action: AUDIT_ACTIONS.ISSUE_CREATED,
          entityType: ENTITY_TYPES.ISSUE,
          entityId: issue.id,
          metadata: { studentId, enrollmentNo: student.enrollmentNo, purpose: purpose || null, dueDate: issue.dueDate, lines },
          req,
        },
        tx
      );
      return tx.issue.findUnique({ where: { id: issue.id }, include: ISSUE_INCLUDE });
    },
    { timeout: 15000 }
  );
  return presentIssue(created);
}

/** DB filter equivalent of presentIssue().isOverdue (calendar-day rule). */
function overdueWhere(now = new Date()) {
  return { status: { not: 'RETURNED' }, dueDate: { lt: startOfCalendarDay(now) } };
}

async function listIssues(q) {
  const and = [];
  if (q.studentId) and.push({ studentId: q.studentId });
  if (q.status) and.push({ status: q.status });
  if (q.overdue === true) and.push(overdueWhere());
  if (q.overdue === false) and.push({ NOT: overdueWhere() });
  if (q.search) {
    and.push({
      OR: [
        { student: { name: { contains: q.search } } },
        { student: { enrollmentNo: { contains: q.search } } },
        { lines: { some: { item: { name: { contains: q.search } } } } },
        { lines: { some: { asset: { assetTag: { contains: q.search } } } } },
      ],
    });
  }
  const where = and.length ? { AND: and } : {};
  const { skip, take, meta } = paginate(q);
  const [total, rows] = await prisma.$transaction([
    prisma.issue.count({ where }),
    prisma.issue.findMany({ where, skip, take, orderBy: [{ issueDate: 'desc' }, { id: 'desc' }], include: ISSUE_INCLUDE }),
  ]);
  const now = new Date();
  return { items: rows.map((r) => presentIssue(r, now)), pagination: meta(total) };
}

/** Student's own issues - studentId comes from the session, never the request. */
async function listMyIssues(user) {
  if (!user.studentId) throw ApiError.forbidden('No student profile is linked to this account');
  const rows = await prisma.issue.findMany({
    where: { studentId: user.studentId },
    orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
    include: ISSUE_INCLUDE,
  });
  const now = new Date();
  return rows.map((r) => presentIssue(r, now));
}

async function getIssue(id, user) {
  const issue = await prisma.issue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
  if (!issue) throw ApiError.notFound('Issue not found');
  assertStudentOwnsOrCoordinator(user, issue.studentId);
  return presentIssue(issue);
}

/** Person 2's overdue report: one row per overdue issue line. */
async function getOverdueLines(where = {}) {
  const issues = await prisma.issue.findMany({
    where: { AND: [overdueWhere(), where] },
    include: ISSUE_INCLUDE,
    orderBy: { dueDate: 'asc' },
  });
  const now = new Date();
  return issues
    .map((i) => presentIssue(i, now))
    .filter((i) => i.isOverdue)
    .flatMap((i) =>
      i.lines
        .filter((l) => l.outstandingQuantity > 0)
        .map((l) => ({
          issueId: i.id,
          issueLineId: l.id,
          studentId: i.student.id,
          studentName: i.student.name,
          enrollmentNo: i.student.enrollmentNo,
          itemName: l.item.name,
          assetTag: l.asset ? l.asset.assetTag : null,
          outstanding: l.outstandingQuantity,
          dueDate: i.dueDate,
          dueCalendarDate: i.dueCalendarDate,
          overdueDays: i.overdueDays,
          renewalStatus: i.renewals[0] ? i.renewals[0].status : null,
        }))
    );
}

module.exports = {
  createIssue,
  listIssues,
  listMyIssues,
  getIssue,
  getOverdueLines,
  presentIssue,
  computeIssueStatus,
  ISSUE_INCLUDE,
  overdueWhere,
};
