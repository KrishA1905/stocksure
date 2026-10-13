import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { fmtDate } from '@/lib/dates';

const LABELS = {
  ISSUE: 'Issued',
  RETURN: 'Returned',
  RENEWAL_REQUEST: 'Renewal requested',
  RENEWAL_APPROVED: 'Renewal approved',
  RENEWAL_REJECTED: 'Renewal rejected',
};

export default function History() {
  const { user } = useAuth();
  const { events, loading } = useStore();
  const mine = events.filter((e) => e.studentId === user.studentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <h1 className="font-display text-5xl leading-[0.9] sm:text-7xl xl:text-8xl">History</h1>
        <p className="mb-2 text-base font-bold uppercase leading-tight">Issues, returns<br />and renewals</p>
      </div>

      <div className="overflow-x-auto border border-ink/35 p-4 md:p-6">
        <Table>
          <TableHeader>
            <TableRow className="border-ink/30 hover:bg-transparent">
              {['Date', 'Event', 'Item', 'Details', 'By'].map((h) => (
                <TableHead key={h} className="text-base font-bold text-ink">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {mine.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-12 text-center font-display text-2xl uppercase">{loading ? 'Loading…' : 'No history yet'}</TableCell>
              </TableRow>
            )}
            {mine.map((e) => (
              <TableRow key={e.id} className="border-ink/20 hover:bg-ink/5">
                <TableCell className="text-base font-semibold uppercase">{fmtDate(e.date)}</TableCell>
                <TableCell>
                  <span className={`inline-block border px-2 py-0.5 text-sm font-bold uppercase ${e.type === 'RENEWAL_REJECTED' ? 'border-alert text-alert' : 'border-ink'}`}>{LABELS[e.type]}</span>
                </TableCell>
                <TableCell className="text-base font-semibold uppercase">{e.itemLabel}</TableCell>
                <TableCell className="text-base">{e.note}</TableCell>
                <TableCell className="text-base font-semibold uppercase">{e.by}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
