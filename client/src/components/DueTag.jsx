import { daysOverdue, daysUntil } from '@/lib/dates';

export const UPCOMING_DAYS = 3;

export default function DueTag({ dueDate }) {
  const od = daysOverdue(dueDate);
  if (od > 0) return <span className="tape tape-alert">Overdue by {od} day{od > 1 ? 's' : ''}</span>;
  const left = daysUntil(dueDate);
  if (left <= UPCOMING_DAYS) return <span className="tape">{left === 0 ? 'Due today' : `Due in ${left} day${left > 1 ? 's' : ''}`}</span>;
  return <span className="inline-block border border-ink px-2 py-0.5 text-sm font-bold uppercase">On time</span>;
}
