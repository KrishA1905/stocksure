const DAY = 86400000;

// 'YYYY-MM-DD' is parsed as a LOCAL date (avoids off-by-one days across timezones)
export const parseDate = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
};
const startOfDay = (d) => { const x = parseDate(d); x.setHours(0, 0, 0, 0); return x; };

export const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
export const toISO = (d) => {
  const x = parseDate(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const fmtDate = (d) =>
  parseDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// positive = days overdue, <= 0 = not overdue
export const daysOverdue = (due, today = new Date()) =>
  Math.round((startOfDay(today) - startOfDay(due)) / DAY);
export const daysUntil = (due, today = new Date()) => -daysOverdue(due, today);
