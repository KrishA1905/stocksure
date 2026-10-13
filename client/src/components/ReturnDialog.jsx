import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, ErrorBox, inputCls } from '@/components/Field';

const CONDITIONS = [
  ['GOOD', 'Good: return to available stock'],
  ['DAMAGED', 'Damaged: keep unavailable'],
  ['MAINTENANCE', 'Needs maintenance: keep unavailable'],
  ['LOST', 'Lost: keep unavailable'],
];

function ReturnForm({ issue, student, onSubmit, onClose }) {
  const isAsset = !!issue.assetId;
  const [qty, setQty] = useState(issue.outstanding);
  const [condition, setCondition] = useState('GOOD');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await onSubmit({
        issueId: issue.id,
        quantityReturned: isAsset ? 1 : Number(qty),
        condition,
        remarks,
      });
      toast.success(res.remaining > 0 ? `Partial return recorded. ${res.remaining} still outstanding.` : 'Return recorded.');
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
        <div className="text-base font-semibold uppercase text-ink/70">
          {student.name} · {student.enrolment} · {issue.outstanding} outstanding
        </div>
      </div>

      {!isAsset && (
        <Field label="Quantity returned" hint={`Up to ${issue.outstanding}. Fewer = partial return, the rest stays outstanding`}>
          <input className={inputCls} type="number" min="1" max={issue.outstanding} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      )}

      <Field label="Condition on return" hint="Only items returned in good condition become available again">
        <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value)}>
          {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>

      <Field label="Remarks (optional)">
        <input className={inputCls} placeholder="e.g. cracked connector" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>

      {error && <ErrorBox>{error}</ErrorBox>}

      <Button type="submit" disabled={busy} className="grunge h-12 w-full rounded-none font-display text-xl tracking-wide">
        {busy ? 'Saving…' : 'Record return'}
      </Button>
    </form>
  );
}

export default function ReturnDialog({ issue, student, onClose, onSubmit }) {
  return (
    <Dialog open={!!issue} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-ink bg-paper sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-4xl uppercase leading-none">Record return</DialogTitle>
          <DialogDescription className="text-base font-semibold uppercase text-ink/70">
            Inspect the item and record its condition.
          </DialogDescription>
        </DialogHeader>
        {issue && <ReturnForm issue={issue} student={student} onSubmit={onSubmit} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
