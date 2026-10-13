import { Link } from 'react-router-dom';
import { ChevronsRight, BellRing } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DueTag from '@/components/DueTag';
import { useStore } from '@/lib/store';
import { daysOverdue, fmtDate } from '@/lib/dates';
import { LoadError } from '@/components/Field';

const STAT_LABELS = ['total', 'available', 'issued', 'overdue', 'unusable', 'renewals'];

export default function Dashboard() {
  const { items, issues, renewals, students, loading, error, refresh } = useStore();

  const sum = (k) => items.reduce((a, i) => a + i[k], 0);
  const active = issues.filter((i) => i.outstanding > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdueIssues = active.filter((i) => daysOverdue(i.dueDate) > 0);
  const pending = renewals.filter((r) => r.status === 'PENDING').length;

  const stats = {
    total: sum('total'), available: sum('available'), issued: sum('issued'),
    overdue: overdueIssues.reduce((a, i) => a + i.outstanding, 0),
    unusable: sum('unusable'), renewals: pending,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <h1 className="font-display text-6xl leading-[0.9] sm:text-8xl xl:text-9xl">Dashboard</h1>
        <p className="mb-2 max-w-[12rem] text-base font-bold uppercase leading-tight">
          Tools for<br />better learning.<br />Built for you.
        </p>
      </div>

      {(overdueIssues.length > 0 || pending > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-2 border-ink px-4 py-3 font-bold uppercase">
          <BellRing size={20} />
          {overdueIssues.length > 0 && <Link to="/issues" className="underline underline-offset-4">{overdueIssues.length} overdue issue{overdueIssues.length > 1 ? 's' : ''}</Link>}
          {pending > 0 && <Link to="/renewals" className="underline underline-offset-4">{pending} renewal request{pending > 1 ? 's' : ''} awaiting approval</Link>}
        </div>
      )}

      {error && <LoadError error={error} onRetry={refresh} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STAT_LABELS.map((k) => (
          <div key={k} className="border border-ink/35">
            <div className="grunge px-3 py-2 font-display text-base uppercase tracking-wide">{k}</div>
            <div className="px-3 py-4 font-display text-6xl leading-none">{loading && !items.length ? '…' : stats[k]}</div>
          </div>
        ))}
      </div>

      <section>
        <div className="banner grunge inline-flex items-center gap-3 py-3 pl-6 pr-16">
          <ChevronsRight size={26} />
          <h2 className="font-display text-3xl">Active issues</h2>
        </div>
        <div className="overflow-x-auto border border-ink/35 p-4 md:p-6">
          <Table>
            <TableHeader>
              <TableRow className="border-ink/30 hover:bg-transparent">
                {['Student', 'Item', 'Qty', 'Due', 'Status'].map((h) => (
                  <TableHead key={h} className="text-base font-bold text-ink">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center font-display text-2xl uppercase">No active issues</TableCell>
                </TableRow>
              )}
              {active.map((i) => {
                const s = students.find((x) => x.id === i.studentId) ?? { name: 'Unknown student', enrolment: '' };
                return (
                  <TableRow key={i.id} className="border-ink/20 hover:bg-ink/5">
                    <TableCell className="py-4">
                      <div className="text-xl font-bold uppercase leading-tight">{s.name}</div>
                      <div className="text-base">{s.enrolment}</div>
                    </TableCell>
                    <TableCell className="text-lg font-semibold uppercase">{i.itemLabel}</TableCell>
                    <TableCell className="text-lg font-semibold">{i.outstanding}</TableCell>
                    <TableCell className="text-lg font-semibold uppercase">{fmtDate(i.dueDate)}</TableCell>
                    <TableCell><DueTag dueDate={i.dueDate} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
