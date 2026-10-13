import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import IssueDialog from '@/components/IssueDialog';
import ReturnDialog from '@/components/ReturnDialog';
import DueTag, { UPCOMING_DAYS } from '@/components/DueTag';
import { useStore } from '@/lib/store';
import { daysOverdue, daysUntil, fmtDate } from '@/lib/dates';
import { LoadError } from '@/components/Field';

export default function Issues() {
  const { items, assets, issues, students, issueItem, returnItem, loading, error, refresh } = useStore();

  const [filter, setFilter] = useState('ALL');
  const [issueOpen, setIssueOpen] = useState(false);
  const [returning, setReturning] = useState(null);

  const studentOf = (id) => students.find((s) => s.id === id) ?? { name: 'Unknown student', enrolment: '' };

  const rows = useMemo(() => {
    const active = issues.filter((i) => i.outstanding > 0);
    if (filter === 'OVERDUE') return active.filter((i) => daysOverdue(i.dueDate) > 0);
    if (filter === 'UPCOMING') return active.filter((i) => daysOverdue(i.dueDate) <= 0 && daysUntil(i.dueDate) <= UPCOMING_DAYS);
    return active;
  }, [issues, filter]);

  const FILTERS = [['ALL', 'All'], ['OVERDUE', 'Overdue'], ['UPCOMING', 'Due soon']];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl leading-[0.9] sm:text-7xl">Issues &amp; Returns</h1>
        <Button onClick={() => setIssueOpen(true)} className="grunge h-12 rounded-none px-6 font-display text-xl tracking-wide">
          <Plus size={20} /> New issue
        </Button>
      </div>

      {error && <LoadError error={error} onRetry={refresh} />}

      <div className="flex gap-2">
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`border border-ink px-4 py-1.5 font-bold transition-colors ${filter === v ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border border-ink/35 p-4 md:p-6">
        <Table>
          <TableHeader>
            <TableRow className="border-ink/30 hover:bg-transparent">
              {['Student', 'Item', 'Outstanding', 'Due', 'Status', ''].map((h, i) => (
                <TableHead key={i} className="text-base font-bold text-ink">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12 text-center font-display text-2xl uppercase">{loading ? 'Loading issues…' : 'Nothing here. All clear.'}</TableCell>
              </TableRow>
            )}
            {rows.map((i) => {
              const s = studentOf(i.studentId);
              return (
                <TableRow key={i.id} className="border-ink/20 hover:bg-ink/5">
                  <TableCell className="py-4">
                    <div className="text-xl font-bold uppercase leading-tight">{s.name}</div>
                    <div className="text-base">{s.enrolment}</div>
                  </TableCell>
                  <TableCell className="text-lg font-semibold uppercase">
                    {i.itemLabel}
                    {i.renewalStatus === 'PENDING' && <div className="text-sm font-bold text-ink/70">Renewal pending</div>}
                  </TableCell>
                  <TableCell className="text-lg font-semibold">{i.outstanding} / {i.quantity}</TableCell>
                  <TableCell className="text-lg font-semibold uppercase">{fmtDate(i.dueDate)}</TableCell>
                  <TableCell><DueTag dueDate={i.dueDate} /></TableCell>
                  <TableCell>
                    <button onClick={() => setReturning(i)}
                      className="border-[1.5px] border-ink px-3 py-1.5 font-bold transition-colors hover:bg-ink hover:text-paper">
                      Return
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} items={items} assets={assets} students={students} onSubmit={issueItem} />
      <ReturnDialog issue={returning} student={returning ? studentOf(returning.studentId) : null} onClose={() => setReturning(null)} onSubmit={returnItem} />
    </div>
  );
}
