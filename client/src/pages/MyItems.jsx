import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RenewalRequestDialog from '@/components/RenewalRequestDialog';
import DueTag, { UPCOMING_DAYS } from '@/components/DueTag';
import { ErrorBox, LoadError } from '@/components/Field';
import { useAuth } from '@/lib/auth';
import { useStore, MAX_RENEWALS } from '@/lib/store';
import { daysOverdue, daysUntil, fmtDate } from '@/lib/dates';

export default function MyItems() {
  const { user } = useAuth();
  const { issues, renewals, requestRenewal, loading, error, refresh } = useStore();
  const [renewing, setRenewing] = useState(null);

  const mine = issues.filter((i) => i.studentId === user.studentId && i.outstanding > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = mine.filter((i) => daysOverdue(i.dueDate) > 0);
  const soon = mine.filter((i) => daysOverdue(i.dueDate) <= 0 && daysUntil(i.dueDate) <= UPCOMING_DAYS);
  const lastRenewal = (row) => renewals.find((r) => r.issueId === row.issueId); // newest first

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <h1 className="font-display text-5xl leading-[0.9] sm:text-7xl xl:text-8xl">My Items</h1>
        <p className="mb-2 text-base font-bold uppercase leading-tight">Hi {user.name}.<br />{mine.length} item{mine.length === 1 ? '' : 's'} on loan</p>
      </div>

      {overdue.length > 0 && (
        <ErrorBox>
          {overdue.length} item{overdue.length > 1 ? 's are' : ' is'} overdue. Please return {overdue.length > 1 ? 'them' : 'it'} to the department inventory coordinator.
        </ErrorBox>
      )}
      {soon.length > 0 && (
        <div className="flex items-center gap-3 border-2 border-ink px-4 py-3 font-bold uppercase">
          <BellRing size={20} /> {soon.length} item{soon.length > 1 ? 's are' : ' is'} due within {UPCOMING_DAYS} days. Return or request a renewal.
        </div>
      )}

      {error && <LoadError error={error} onRetry={refresh} />}

      {mine.length === 0 && (
        <div className="border border-ink/35 p-12 text-center font-display text-3xl uppercase">{loading ? 'Loading…' : 'You have nothing on loan'}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {mine.map((i) => {
          const r = lastRenewal(i);
          const pending = r?.status === 'PENDING';
          return (
            <div key={i.id} className="flex flex-col border border-ink/35">
              <div className="grunge flex items-center justify-between gap-3 px-4 py-3">
                <div className="font-display text-xl uppercase leading-tight">{i.itemLabel}</div>
                <div className="font-display text-xl">× {i.outstanding}</div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <div className="text-sm font-bold uppercase text-ink/70">Due date</div>
                  <div className="font-display text-3xl leading-tight">{fmtDate(i.dueDate)}</div>
                </div>
                <div><DueTag dueDate={i.dueDate} /></div>
                <div className="text-sm font-semibold uppercase text-ink/70">
                  Issued {fmtDate(i.issueDate)} · Renewals {i.renewalCount} / {MAX_RENEWALS}
                </div>

                {r && (
                  <div className={`border p-3 text-sm font-bold uppercase leading-snug ${r.status === 'REJECTED' ? 'border-alert text-alert' : 'border-ink/50'}`}>
                    {r.status === 'PENDING' && <>Renewal requested {fmtDate(r.requestDate)}. Awaiting approval. Due date unchanged.</>}
                    {r.status === 'APPROVED' && <>Renewal approved. Due date extended to {fmtDate(r.newDue)}.{r.remarks && <> “{r.remarks}”</>}</>}
                    {r.status === 'REJECTED' && <>Renewal rejected. {r.remarks}</>}
                  </div>
                )}

                <Button
                  onClick={() => setRenewing(i)}
                  disabled={pending || i.renewalCount >= MAX_RENEWALS}
                  variant="outline"
                  className="mt-auto h-11 rounded-none border-ink/80 bg-transparent font-bold hover:bg-ink hover:text-paper"
                >
                  {pending ? 'Renewal pending' : 'Request renewal'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <RenewalRequestDialog issue={renewing} onClose={() => setRenewing(null)} onSubmit={requestRenewal} />
    </div>
  );
}
