// OWNER: Person 2 (business logic) - integrated into the shared backend by Person 1.
const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const { paginate } = require('../utils/pagination');
const { runInTransaction } = require('../utils/transaction');
const { calculateRenewedDueDate, isOverdue, toCalendarDate } = require('../utils/dates');
const { createAuditLog } = require('./audit.service');
const { ROLES, AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');
const { lockRows } = require('./stock.helpers');

// Department policy: how many APPROVED renewals one issue may get.
const MAX_RENEWALS_PER_ISSUE = Number(process.env.MAX_RENEWALS_PER_ISSUE) || 2;

const RENEWAL_INCLUDE = {
  requestedBy: { select: { id: true, email: true } },
  approvedBy: { select: { id: true, email: true } },
  issue: {
    select: {
      id: true,
      issueDate: true,
      dueDate: true,
      status: true,
      purpose: true,
      student: { select: { id: true, name: true, enrollmentNo: true } },
      lines: {
        select: {
          id: true,
          quantity: true,
          returnedQuantity: true,
          item: { select: { id: true, name: true, itemCode: true } },
          asset: { select: { id: true, assetTag: true } },
        },
      },
    },
  },
};

function presentRenewal(r) {
  return {
    ...r,
    decision: r.status, // Person 2 field name
    decidedAt: r.approvedAt,
    currentDueDate: r.issue ? r.issue.dueDate : undefined,
    currentDueCalendarDate: r.issue ? toCalendarDate(r.issue.dueDate) : undefined,
  };
}

/**
 * POST /api/renewals - student asks for more time on their OWN issue.
 * A request NEVER changes the due date.
 */
async function requestRenewal({ issueId, remarks }, req) {
  const studentId = req.user.studentId;
  if (!studentId) throw ApiError.forbidden('No student profile is linked to this account');

  return runInTransaction(async (tx) => {
    await lockRows(tx, 'issue', [issueId]);
    const issue = await tx.issue.findUnique({ where: { id: issueId }, include: { lines: true } });
    // Same 404 for "missing" and "someone else's" -> no information leak.
    if (!issue || issue.studentId !== studentId) throw ApiError.notFound('Issue not found');

    const hasOutstanding = issue.lines.some((l) => l.quantity - l.returnedQuantity > 0);
    if (!hasOutstanding) throw ApiError.conflict('No outstanding items to renew');
    if (isOverdue(issue.dueDate)) {
      throw ApiError.conflict('Cannot request renewal: this borrowing is already overdue. Please return the items.');
    }
    const pending = await tx.renewal.findFirst({ where: { issueId, status: 'PENDING' } });
    if (pending) throw ApiError.conflict('A pending renewal request already exists for this issue');
    const approved = await tx.renewal.count({ where: { issueId, status: 'APPROVED' } });
    if (approved >= MAX_RENEWALS_PER_ISSUE) {
      throw ApiError.conflict(`Renewal limit reached (${MAX_RENEWALS_PER_ISSUE} per issue). Please return the items.`);
    }

    const renewal = await tx.renewal.create({
      data: { issueId, requestedById: req.user.id, status: 'PENDING', oldDueDate: issue.dueDate, remarks: remarks || null },
    });
    await createAuditLog(
      { action: AUDIT_ACTIONS.RENEWAL_REQUESTED, entityType: ENTITY_TYPES.RENEWAL, entityId: renewal.id, metadata: { issueId, dueDate: issue.dueDate, remarks: remarks || null }, req },
      tx
    );
    return presentRenewal(await tx.renewal.findUnique({ where: { id: renewal.id }, include: RENEWAL_INCLUDE }));
  });
}

/**
 * PATCH /api/renewals/:id - coordinator decision.
 * APPROVED: dueDate = EXISTING dueDate + 15 days (not today, not request date).
 * REJECTED: dueDate unchanged.
 */
async function decideRenewal(id, { status, remarks }, req) {
  return runInTransaction(async (tx) => {
    await lockRows(tx, 'renewal', [id]);
    const renewal = await tx.renewal.findUnique({ where: { id } });
    if (!renewal) throw ApiError.notFound('Renewal not found');
    if (renewal.status !== 'PENDING') throw ApiError.conflict(`Renewal is already ${renewal.status}`);

    await lockRows(tx, 'issue', [renewal.issueId]);
    const issue = await tx.issue.findUnique({ where: { id: renewal.issueId } });
    const now = new Date();

    if (status === 'APPROVED') {
      if (issue.status === 'RETURNED') throw ApiError.conflict('All items on this issue were already returned');
      const previousDue = issue.dueDate;
      const newDue = calculateRenewedDueDate(previousDue);
      await tx.issue.update({ where: { id: issue.id }, data: { dueDate: newDue } });
      await tx.renewal.update({
        where: { id },
        data: { status: 'APPROVED', oldDueDate: previousDue, newDueDate: newDue, approvedById: req.user.id, approvedAt: now, decisionRemarks: remarks || null },
      });
      await createAuditLog(
        { action: AUDIT_ACTIONS.RENEWAL_APPROVED, entityType: ENTITY_TYPES.RENEWAL, entityId: id, metadata: { issueId: issue.id, previousDue, newDue, remarks: remarks || null }, req },
        tx
      );
    } else {
      await tx.renewal.update({
        where: { id },
        data: { status: 'REJECTED', approvedById: req.user.id, approvedAt: now, decisionRemarks: remarks || null },
      });
      await createAuditLog(
        { action: AUDIT_ACTIONS.RENEWAL_REJECTED, entityType: ENTITY_TYPES.RENEWAL, entityId: id, metadata: { issueId: issue.id, dueDate: issue.dueDate, remarks: remarks || null }, req },
        tx
      );
    }
    return presentRenewal(await tx.renewal.findUnique({ where: { id }, include: RENEWAL_INCLUDE }));
  });
}

/** GET /api/renewals - coordinators see all; students only their own. */
async function listRenewals(q, user) {
  const where = {};
  if (q.status) where.status = q.status;
  if (user.role !== ROLES.COORDINATOR) {
    if (!user.studentId) throw ApiError.forbidden('No student profile is linked to this account');
    where.issue = { studentId: user.studentId };
  }
  const { skip, take, meta } = paginate(q);
  const [total, rows] = await prisma.$transaction([
    prisma.renewal.count({ where }),
    prisma.renewal.findMany({ where, skip, take, orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }], include: RENEWAL_INCLUDE }),
  ]);
  return { items: rows.map(presentRenewal), pagination: meta(total) };
}

module.exports = { requestRenewal, decideRenewal, listRenewals };
