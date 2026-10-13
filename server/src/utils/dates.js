const { LOAN_PERIOD_DAYS, RENEWAL_EXTENSION_DAYS } = require('../config/constants');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) throw new TypeError('Invalid date');
  return d;
}

/** Adds whole calendar days in UTC (no DST drift). */
function addDays(value, days) {
  const d = toDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Server-authoritative due date: issue date + 15 calendar days.
 *   2026-10-01 -> 2026-10-16
 *   2026-10-16 -> 2026-10-31
 */
function calculateDueDate(issueDate = new Date()) {
  return addDays(issueDate, LOAN_PERIOD_DAYS);
}

/** Approved renewal: EXISTING due date + 15 calendar days. */
function calculateRenewedDueDate(existingDueDate) {
  return addDays(existingDueDate, RENEWAL_EXTENSION_DAYS);
}

/** Whole days overdue (0 if not overdue). */
function daysOverdue(dueDate, now = new Date()) {
  const diff = toDate(now).getTime() - toDate(dueDate).getTime();
  return diff > 0 ? Math.floor(diff / MS_PER_DAY) : 0;
}

function isOverdue(dueDate, now = new Date()) {
  return toDate(now).getTime() > toDate(dueDate).getTime();
}

module.exports = { addDays, calculateDueDate, calculateRenewedDueDate, daysOverdue, isOverdue };
