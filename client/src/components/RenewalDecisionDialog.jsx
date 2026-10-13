import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, ErrorBox, inputCls } from '@/components/Field';
import { addDays, fmtDate } from '@/lib/dates';

function Form({ renewal, issue, student, decision, onSubmit, onClose }) {
  const approve = decision === 'APPROVE';
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await onSubmit({ renewalId: renewal.id, decision, remarks });
      toast.success(approve ? `Approved. New due date ${fmtDate(res.newDue)}.` : 'Renewal rejected.');
      onClose();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="border border-ink/35 p-3">
        <div className="text-xl font-bold uppercase leading-tight">{issue.itemLabel}</div>
        <div className="text-base font-semibold uppercase text-ink/70">{student.name} · {student.enrolment}</div>
        {renewal.reason && <div className="mt-1 text-base">“{renewal.reason}”</div>}
      </div>
      {approve && (
        <div className="flex items-center justify-between border border-ink/35 px-4 py-3">
          <span className="text-sm font-bold uppercase text-ink/70">{fmtDate(issue.dueDate)} →</span>
          <span className="font-display text-2xl">{fmtDate(addDays(issue.dueDate, 15))}</span>
        </div>
      )}
      <Field label={approve ? 'Remarks (optional)' : 'Remarks (required)'}>
        <input className={inputCls} placeholder={approve ? 'e.g. Approved for project work' : 'Reason for rejection'} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Button type="submit" disabled={busy}
        className={`h-12 w-full rounded-none font-display text-xl tracking-wide ${approve ? 'grunge' : 'border-2 border-alert bg-transparent text-alert hover:bg-alert hover:text-paper'}`}>
        {busy ? 'Saving…' : approve ? 'Approve renewal' : 'Reject renewal'}
      </Button>
    </form>
  );
}

export default function RenewalDecisionDialog({ target, issue, student, onClose, onSubmit }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-ink bg-paper sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-4xl uppercase leading-none">
            {target?.decision === 'APPROVE' ? 'Approve renewal' : 'Reject renewal'}
          </DialogTitle>
          <DialogDescription className="text-base font-semibold uppercase text-ink/70">Extends from the existing due date by 15 days.</DialogDescription>
        </DialogHeader>
        {target && issue && student && (
          <Form renewal={target.renewal} issue={issue} student={student} decision={target.decision} onSubmit={onSubmit} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
