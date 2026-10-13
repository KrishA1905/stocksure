// OWNER: Person 2 (business logic) - integrated into the shared backend by Person 1.
const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const { ROLES } = require('../config/constants');
const { toCalendarDate, addCalendarDays, todayISO } = require('../utils/dates');
const { ISSUE_INCLUDE, presentIssue, overdueWhere, getOverdueLines } = require('./issue.service');

const ACTIVITY_ACTIONS = [
  'ISSUE_CREATED',
  'RETURN_CREATED',
  'RENEWAL_REQUESTED',
  'RENEWAL_APPROVED',
  'RENEWAL_REJECTED',
  'STOCK_ADJUSTED',
  'ASSET_STATUS_CHANGED',
  'ITEM_CREATED',
  'ASSET_CREATED',
];

/** Issued vs returned units per calendar day for the last `days` days. */
async function buildTrend(days = 14) {
  const today = todayISO();
  const from = addCalendarDays(today, -(days - 1));
  const since = new Date(Date.parse(`${from}T00:00:00Z`) - 14 * 3600 * 1000); // generous lower bound for any timezone
  const [issueLines, returns] = await Promise.all([
    prisma.issueLine.findMany({ where: { issue: { issueDate: { gte: since } } }, select: { quantity: true, issue: { select: { issueDate: true } } } }),
    prisma.returnRecord.findMany({ where: { returnDate: { gte: since } }, select: { quantity: true, returnDate: true } }),
  ]);
  const buckets = new Map();
  for (let i = 0; i < days; i += 1) buckets.set(addCalendarDays(from, i), { date: addCalendarDays(from, i), issued: 0, returned: 0 });
  for (const l of issueLines) {
    const b = buckets.get(toCalendarDate(l.issue.issueDate));
    if (b) b.issued += l.quantity;
  }
  for (const r of returns) {
    const b = buckets.get(toCalendarDate(r.returnDate));
    if (b) b.returned += r.quantity;
  }
  return [...buckets.values()];
}

async function coordinatorDashboard() {
  const [items, pendingRenewals, activeStudents, assetGroups, overdueIssues, recent, overdueList, trend] = await Promise.all([
    prisma.item.findMany({ where: { active: true } }),
    prisma.renewal.count({ where: { status: 'PENDING' } }),
    prisma.student.count({ where: { user: { active: true } } }),
    prisma.asset.groupBy({ by: ['conditionStatus'], where: { active: true }, _count: { _all: true } }),
    prisma.issue.count({ where: overdueWhere() }),
    prisma.auditLog.findMany({
      where: { action: { in: ACTIVITY_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { email: true, role: true } } },
    }),
    getOverdueLines(),
    buildTrend(14),
  ]);

  const sum = (f) => items.reduce((s, i) => s + i[f], 0);
  const totalQuantity = sum('totalQuantity');
  const availableQuantity = sum('availableQuantity');
  const unavailableQuantity = sum('unavailableQuantity');
  const outstandingQuantity = Math.max(0, totalQuantity - availableQuantity - unavailableQuantity);

  const byCategoryMap = new Map();
  for (const i of items) {
    const c = byCategoryMap.get(i.category) || { category: i.category, total: 0, available: 0, issued: 0, unavailable: 0 };
    c.total += i.totalQuantity;
    c.available += i.availableQuantity;
    c.unavailable += i.unavailableQuantity;
    c.issued += Math.max(0, i.totalQuantity - i.availableQuantity - i.unavailableQuantity);
    byCategoryMap.set(i.category, c);
  }

  const lowStock = items
    .filter((i) => i.totalQuantity > 0 && i.availableQuantity <= Math.ceil(i.totalQuantity * 0.2))
    .map((i) => ({ id: i.id, name: i.name, itemCode: i.itemCode, availableQuantity: i.availableQuantity, totalQuantity: i.totalQuantity }));

  return {
    // Person 2 fields
    totalItemTypes: items.length,
    totalQuantity,
    availableQuantity,
    outstandingQuantity,
    unavailableQuantity,
    overdueIssues,
    pendingRenewals,
    overdueList,
    // Extra data for charts / cards
    activeStudents,
    unavailableAssets: assetGroups.filter((g) => g.conditionStatus !== 'USABLE' && g.conditionStatus !== 'RETIRED').reduce((s, g) => s + g._count._all, 0),
    byCategory: [...byCategoryMap.values()],
    assetStatus: assetGroups.map((g) => ({ status: g.conditionStatus, count: g._count._all })),
    lowStock,
    trend,
    recentActivity: recent.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: a.metadata,
      createdAt: a.createdAt,
      user: a.user,
    })),
  };
}

async function studentDashboard(user) {
  // Without this guard `where: { studentId: undefined }` would match EVERY issue.
  if (!user.studentId) throw ApiError.forbidden('No student profile is linked to this account');
  const rows = await prisma.issue.findMany({
    where: { studentId: user.studentId },
    include: ISSUE_INCLUDE,
    orderBy: { dueDate: 'asc' },
  });
  const now = new Date();
  const issues = rows.map((r) => presentIssue(r, now));
  const open = issues.filter((i) => i.outstandingQuantity > 0);
  const overdue = open.filter((i) => i.isOverdue);
  const dueSoon = open.filter((i) => !i.isOverdue && i.daysUntilDue !== null && i.daysUntilDue <= 3);
  const pendingRenewals = issues.filter((i) => i.pendingRenewal).length;
  const nextDue = open.filter((i) => !i.isOverdue).sort((a, b) => a.dueDate - b.dueDate)[0] || null;

  return {
    // Person 2 fields
    myOutstanding: open.reduce((s, i) => s + i.outstandingQuantity, 0),
    myOverdue: overdue.length,
    myTotalIssues: issues.length,
    // Contract fields
    activeBorrowings: open.length,
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    pendingRenewals,
    nextDueDate: nextDue ? nextDue.dueDate : null,
    openIssues: open,
  };
}

async function getDashboard(user) {
  if (user.role === ROLES.COORDINATOR) return { role: ROLES.COORDINATOR, ...(await coordinatorDashboard()) };
  return { role: ROLES.STUDENT, ...(await studentDashboard(user)) };
}

module.exports = { getDashboard };
