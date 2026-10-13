// Person 2's date unit tests, ported to the shared utils/dates.js.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isValidISODate, addCalendarDays, todayISO, toCalendarDate, daysOverdue, isOverdue, startOfCalendarDay } = require('../src/utils/dates');

describe('isValidISODate', () => {
  it('accepts valid dates', () => {
    assert.equal(isValidISODate('2026-10-01'), true);
    assert.equal(isValidISODate('2026-01-31'), true);
    assert.equal(isValidISODate('2024-02-29'), true); // leap year
    assert.equal(isValidISODate('2026-12-31'), true);
  });

  it('rejects impossible dates', () => {
    assert.equal(isValidISODate('2026-02-30'), false);
    assert.equal(isValidISODate('2026-02-29'), false);
    assert.equal(isValidISODate('2026-04-31'), false);
    assert.equal(isValidISODate('2026-13-01'), false);
    assert.equal(isValidISODate('2026-00-01'), false);
  });

  it('rejects malformed strings', () => {
    for (const v of ['', '2026/10/01', '10-01-2026', 'not-a-date', null, undefined, 42]) {
      assert.equal(isValidISODate(v), false);
    }
  });
});

describe('addCalendarDays', () => {
  it('adds days correctly', () => {
    assert.equal(addCalendarDays('2026-10-01', 15), '2026-10-16');
    assert.equal(addCalendarDays('2026-10-16', 15), '2026-10-31');
  });
  it('handles month, year and leap boundaries', () => {
    assert.equal(addCalendarDays('2026-01-25', 10), '2026-02-04');
    assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
    assert.equal(addCalendarDays('2024-02-29', 1), '2024-03-01');
  });
  it('throws on invalid date', () => {
    assert.throws(() => addCalendarDays('invalid', 5));
  });
});

describe('calendar-day overdue rule (Asia/Kolkata)', () => {
  it('todayISO is a valid YYYY-MM-DD', () => {
    assert.equal(isValidISODate(todayISO()), true);
  });
  it('uses the IST calendar date, not UTC', () => {
    // 2026-10-16 20:00 UTC is already 17 Oct in India.
    assert.equal(toCalendarDate('2026-10-16T20:00:00Z'), '2026-10-17');
  });
  it('an item due today is not overdue until the next calendar day', () => {
    const due = new Date('2026-10-16T05:00:00Z'); // 16 Oct 10:30 IST
    assert.equal(isOverdue(due, new Date('2026-10-16T18:00:00Z')), false); // 16 Oct 23:30 IST
    assert.equal(isOverdue(due, new Date('2026-10-16T18:31:00Z')), true); // 17 Oct 00:01 IST
    assert.equal(daysOverdue(due, new Date('2026-10-19T06:00:00Z')), 3);
  });
  it('startOfCalendarDay is IST midnight', () => {
    assert.equal(startOfCalendarDay(new Date('2026-10-16T10:00:00Z')).toISOString(), '2026-10-15T18:30:00.000Z');
  });
});
