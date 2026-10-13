const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDueDate, calculateRenewedDueDate, daysOverdue, isOverdue } = require('../src/utils/dates');

const ymd = (d) => d.toISOString().slice(0, 10);

test('calculateDueDate: issue date + 15 calendar days', () => {
  assert.equal(ymd(calculateDueDate('2026-10-01T00:00:00Z')), '2026-10-16');
  assert.equal(ymd(calculateDueDate('2026-10-16T00:00:00Z')), '2026-10-31');
});

test('calculateDueDate: crosses month / year / leap-day boundaries', () => {
  assert.equal(ymd(calculateDueDate('2026-12-25T10:00:00Z')), '2027-01-09');
  assert.equal(ymd(calculateDueDate('2028-02-20T00:00:00Z')), '2028-03-06'); // 2028 is a leap year
  assert.equal(ymd(calculateDueDate('2027-02-20T00:00:00Z')), '2027-03-07');
});

test('calculateDueDate preserves time of day and does not mutate input', () => {
  const issued = new Date('2026-10-01T09:30:00Z');
  const due = calculateDueDate(issued);
  assert.equal(due.toISOString(), '2026-10-16T09:30:00.000Z');
  assert.equal(issued.toISOString(), '2026-10-01T09:30:00.000Z');
});

test('approved renewal extends the EXISTING due date by 15 days', () => {
  const due = calculateDueDate('2026-10-01T00:00:00Z');
  assert.equal(ymd(calculateRenewedDueDate(due)), '2026-10-31');
});

test('calculateDueDate rejects invalid dates', () => {
  assert.throws(() => calculateDueDate('not-a-date'), TypeError);
});

test('overdue helpers', () => {
  const due = new Date('2026-10-16T00:00:00Z');
  assert.equal(isOverdue(due, new Date('2026-10-15T23:59:59Z')), false);
  assert.equal(daysOverdue(due, new Date('2026-10-15T00:00:00Z')), 0);
  assert.equal(isOverdue(due, new Date('2026-10-19T12:00:00Z')), true);
  assert.equal(daysOverdue(due, new Date('2026-10-19T12:00:00Z')), 3);
});
