import { useState } from 'react';
import { toast } from 'sonner';
import { Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, ErrorBox, inputCls } from '@/components/Field';
import { addDays, fmtDate } from '@/lib/dates';

const TERM_DAYS = 15;

function IssueForm({ items, assets, students, onSubmit, onClose }) {
  const [studentId, setStudentId] = useState('');
  const [itemId, setItemId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [slip, setSlip] = useState(null);

  const item = items.find((i) => String(i.id) === itemId);
  const isAsset = item?.tracking === 'ASSET';
  const itemAssets = item ? assets[item.id] ?? [] : [];
  const previewDue = addDays(new Date(), TERM_DAYS);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!studentId || !itemId) return setError('Select a student and an item.');
    if (isAsset && !assetId) return setError('Select the specific asset to issue.');
    setBusy(true);
    try {
      const result = await onSubmit({
        studentId: Number(studentId),
        itemId: Number(itemId),
        assetId: isAsset ? assetId : undefined,
        quantity: isAsset ? 1 : Number(quantity),
        purpose,
      });
      setSlip(result);
      toast.success('Item issued');
    } catch (err) {
      setError(err.message);   // clear reason, e.g. "5 × HDMI Adapter requested, but only 3 currently available."
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Acknowledgement slip ----
  if (slip) {
    const rows = [
      ['Student', `${slip.student.name} (${slip.student.enrolment})`],
      ['Programme', `${slip.student.programme}, ${slip.student.semester}`],
      ['Item', slip.itemLabel],
      ['Quantity', slip.quantity],
      ['Issue date', fmtDate(slip.issueDate)],
      ['Issued by', slip.issuedBy],
    ];
    return (
      <div className="space-y-5">
        <div className="print-area space-y-4 border border-ink p-5">
          <h3 className="font-display text-2xl">Issue acknowledgement</h3>
          <dl className="space-y-1">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-ink/20 py-1">
                <dt className="text-sm font-bold uppercase text-ink/70">{k}</dt>
                <dd className="text-lg font-semibold uppercase">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="grunge p-4">
            <div className="text-sm font-bold uppercase">Return or renew by</div>
            <div className="font-display text-4xl">{fmtDate(slip.dueDate)}</div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => window.print()} className="h-11 flex-1 rounded-none font-bold">
            <Printer size={16} /> Print slip
          </Button>
          <Button variant="outline" onClick={onClose} className="h-11 flex-1 rounded-none border-ink/80 bg-transparent font-bold">
            Done
          </Button>
        </div>
      </div>
    );
  }

  // ---- Form ----
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Student">
        <select className={inputCls} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Select registered student…</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.enrolment}</option>)}
        </select>
      </Field>

      <Field label="Item">
        <select
          className={inputCls}
          value={itemId}
          onChange={(e) => { setItemId(e.target.value); setAssetId(''); setQuantity(1); setError(''); }}
        >
          <option value="">Select item…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.name} ({i.available} available)</option>
          ))}
        </select>
      </Field>

      {isAsset && (
        <Field label="Asset" hint="Only available assets in usable condition can be issued">
          <select className={inputCls} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">Select asset…</option>
            {itemAssets.map((a) => (
              <option key={a.assetId} value={a.assetId} disabled={a.status !== 'AVAILABLE'}>
                {a.assetId} — {a.status}{a.holder ? ` (${a.holder})` : ''}
              </option>
            ))}
          </select>
        </Field>
      )}

      {item && !isAsset && (
        <Field label="Quantity" hint={`${item.available} currently available`}>
          <input className={inputCls} type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      )}

      <Field label="Purpose">
        <input className={inputCls} placeholder="e.g. Embedded systems lab project" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </Field>

      <div className="flex items-center justify-between border border-ink/35 px-4 py-3">
        <span className="text-sm font-bold uppercase text-ink/70">Due date (issue + {TERM_DAYS} days)</span>
        <span className="font-display text-2xl">{fmtDate(previewDue)}</span>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <Button type="submit" disabled={busy} className="grunge h-12 w-full rounded-none font-display text-xl tracking-wide">
        {busy ? 'Issuing…' : 'Issue item'}
      </Button>
    </form>
  );
}

export default function IssueDialog({ open, onOpenChange, ...rest }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-ink bg-paper sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-4xl uppercase leading-none">Issue item</DialogTitle>
          <DialogDescription className="text-base font-semibold uppercase text-ink/70">
            Registered students only. Due date is calculated automatically.
          </DialogDescription>
        </DialogHeader>
        <IssueForm {...rest} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
