import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, ErrorBox, inputCls } from '@/components/Field';
import { addDays, fmtDate } from '@/lib/dates';

function Form({ issue, onSubmit, onClose }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit({ issueId: issue.id, reason });
      toast.success('Renewal requested. Waiting for coordinator approval.');
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
        <div className="text-base font-semibold uppercase text-ink/70">Current due date: {fmtDate(issue.dueDate)}</div>
      </div>
      <Field label="Reason for renewal">
        <input className={inputCls} placeholder="e.g. Project submission extended" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p className="border border-ink/35 p-3 text-sm font-bold uppercase leading-snug">
        Your due date stays {fmtDate(issue.dueDate)} until the coordinator approves. If approved, it moves to {fmtDate(addDays(issue.dueDate, 15))}.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Button type="submit" disabled={busy} className="grunge h-12 w-full rounded-none font-display text-xl tracking-wide">
        {busy ? 'Sending…' : 'Send request'}
      </Button>
    </form>
  );
}

export default function RenewalRequestDialog({ issue, onClose, onSubmit }) {
  return (
    <Dialog open={!!issue} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-ink bg-paper sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-4xl uppercase leading-none">Request renewal</DialogTitle>
          <DialogDescription className="text-base font-semibold uppercase text-ink/70">Each approved renewal adds 15 days.</DialogDescription>
        </DialogHeader>
        {issue && <Form issue={issue} onSubmit={onSubmit} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
