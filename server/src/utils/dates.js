const { LOAN_PERIOD_DAYS, RENEWAL_EXTENSION_DAYS } = require('../config/constants');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Overdue / renewal cut-offs are CALENDAR-day rules, evaluated in the
// department's timezone (default India). Override with APP_TIMEZONE.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

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

/** 'YYYY-MM-DD' of an instant, as seen in APP_TIMEZONE. */
function toCalendarDate(value, timeZone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(toDate(value));
}

/**
 * The instant the current calendar day began in APP_TIMEZONE. Anything due
 * before this instant (and not returned) is overdue - usable in DB filters.
 */
function startOfCalendarDay(now = new Date(), timeZone = APP_TIMEZONE) {
  const d = toDate(now);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  const wallClockAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = wallClockAsUtc - Math.floor(d.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offsetMs);
}

/** Whole calendar days between two 'YYYY-MM-DD' strings (b - a). */
function calendarDaysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

/** Overdue = today's calendar date is AFTER the due date's calendar date. */
function isOverdue(dueDate, now = new Date()) {
  return toCalendarDate(now) > toCalendarDate(dueDate);
}

/** Whole calendar days overdue (0 if not overdue). */
function daysOverdue(dueDate, now = new Date()) {
  return Math.max(0, calendarDaysBetween(toCalendarDate(dueDate), toCalendarDate(now)));
}

/** Calendar days until due (negative when overdue). */
function daysUntilDue(dueDate, now = new Date()) {
  return calendarDaysBetween(toCalendarDate(now), toCalendarDate(dueDate));
}

// ---- Calendar-string helpers (ported from Person 2's utils/dates.js) ----

/** Validates a real 'YYYY-MM-DD' calendar date (rejects 2026-02-30). */
function isValidISODate(str) {
  if (typeof str !== 'string') return false;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** 'YYYY-MM-DD' + n calendar days -> 'YYYY-MM-DD' (works at UTC noon). */
function addCalendarDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${dateStr}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in APP_TIMEZONE. */
function todayISO() {
  return toCalendarDate(new Date());
}

module.exports = {
  APP_TIMEZONE,
  addDays,
  calculateDueDate,
  calculateRenewedDueDate,
  toCalendarDate,
  startOfCalendarDay,
  calendarDaysBetween,
  isOverdue,
  daysOverdue,
  daysUntilDue,
  isValidISODate,
  addCalendarDays,
  todayISO,
};
