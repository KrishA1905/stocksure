import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import RenewalDecisionDialog from '@/components/RenewalDecisionDialog';
import { useStore } from '@/lib/store';
import { addDays, fmtDate } from '@/lib/dates';
import { LoadError } from '@/components/Field';

export default function Renewals() {
  const { renewals, students, decideRenewal, issueOf, loading, error, refresh } = useStore();
  const [target, setTarget] = useState(null); // { renewal, decision }

  const pending = renewals.filter((r) => r.status === 'PENDING');
  const decided = renewals.filter((r) => r.status !== 'PENDING');
  const studentOf = (id) => students.find((s) => s.id === id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <h1 className="font-display text-5xl leading-[0.9] sm:text-7xl">Renewals</h1>
        <p className="mb-2 text-base font-bold uppercase leading-tight">{pending.length} awaiting approval</p>
      </div>

      {error && <LoadError error={error} onRetry={refresh} />}

      {/* Pending */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl">Pending requests</h2>
        {pending.length === 0 && (
          <div className="border border-ink/35 p-10 text-center font-display text-2xl uppercase">{loading ? 'Loading…' : 'No pending requests'}</div>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {pending.map((r) => {
            const issue = issueOf(r.issueId);
            const s = studentOf(r.studentId);
            if (!issue || !s) return null;
            return (
              <div key={r.id} className="border border-ink/35">
                <div className="grunge px-4 py-2 font-display text-lg uppercase">{issue.itemLabel}</div>
                <div className="space-y-3 p-4">
                  <div>
                    <div className="text-xl font-bold uppercase leading-tight">{s.name}</div>
                    <div className="text-base">{s.enrolment} · requested {fmtDate(r.requestDate)}</div>
                  </div>
                  {r.reason && <p className="text-lg">“{r.reason}”</p>}
                  <div className="flex items-center justify-between border border-ink/35 px-3 py-2">
                    <span className="text-sm font-bold uppercase text-ink/70">{fmtDate(issue.dueDate)} →</span>
                    <span className="font-display text-xl">{fmtDate(addDays(issue.dueDate, 15))}</span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setTarget({ renewal: r, decision: 'APPROVE' })}
                      className="grunge flex flex-1 items-center justify-center gap-2 py-2.5 font-bold">
                      <Check size={18} /> Approve
                    </button>
                    <button onClick={() => setTarget({ renewal: r, decision: 'REJECT' })}
                      className="flex flex-1 items-center justify-center gap-2 border-[1.5px] border-ink py-2.5 font-bold transition-colors hover:bg-ink hover:text-paper">
                      <X size={18} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Decided */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl">Decided</h2>
        <div className="overflow-x-auto border border-ink/35 p-4 md:p-6">
          <Table>
            <TableHeader>
              <TableRow className="border-ink/30 hover:bg-transparent">
                {['Student', 'Item', 'Decision', 'New due date', 'Remarks', 'By'].map((h) => (
                  <TableHead key={h} className="text-base font-bold text-ink">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {decided.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-8 text-center font-display text-xl uppercase">Nothing decided yet</TableCell>
                </TableRow>
              )}
              {decided.map((r) => {
                const issue = issueOf(r.issueId);
                const s = studentOf(r.studentId);
                return (
                  <TableRow key={r.id} className="border-ink/20 hover:bg-ink/5">
                    <TableCell className="text-lg font-bold uppercase">{s?.name}</TableCell>
                    <TableCell className="text-base font-semibold uppercase">{issue?.itemLabel ?? r.itemLabel}</TableCell>
                    <TableCell>
                      <span className={`inline-block border px-2 py-0.5 text-sm font-bold uppercase ${r.status === 'APPROVED' ? 'border-ink bg-ink text-paper' : 'border-alert text-alert'}`}>{r.status}</span>
                    </TableCell>
                    <TableCell className="text-base font-semibold uppercase">{r.newDue ? fmtDate(r.newDue) : '—'}</TableCell>
                    <TableCell className="text-base">{r.remarks || '—'}</TableCell>
                    <TableCell className="text-base font-semibold uppercase">{r.decidedBy}<div className="text-sm text-ink/70">{fmtDate(r.decidedDate)}</div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <RenewalDecisionDialog
        target={target}
        issue={target ? issueOf(target.renewal.issueId) : null}
        student={target ? studentOf(target.renewal.studentId) : null}
        onClose={() => setTarget(null)}
        onSubmit={decideRenewal}
      />
    </div>
  );
}
