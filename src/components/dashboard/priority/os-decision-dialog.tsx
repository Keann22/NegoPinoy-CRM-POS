'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { OS_DECISIONS, type MissingItem, type OsDecision, type PriorityRow } from '@/lib/priority/priority-rules';

const EXPLAIN: Record<OsDecision, string> = {
  wait: 'The item stays on this order and goes on the buy list (lay-aways too). The order ships when it arrives.',
  carry_over: 'The rest of the order ships now. The item is saved as "to follow" on the customer and stays on the buy list; it is added to their next order at the price they already paid.',
  remove: 'The customer no longer wants it. You remove it from the order; what they paid for it becomes store credit.',
};

interface Props {
  row: PriorityRow | null;
  item: MissingItem | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Sales' answer for one OS item: wait, send the rest (item to follow), or remove it. */
export function OsDecisionDialog({ row, item, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<OsDecision | ''>('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [needsEdit, setNeedsEdit] = useState(false);

  useEffect(() => {
    setDecision('');
    setNote('');
    setNeedsEdit(false);
  }, [row?.id, item?.productId]);

  if (!row || !item) return null;
  const shortId = row.id.slice(0, 7).toUpperCase();
  const canSave = decision !== '' && (decision === 'wait' || note.trim().length >= 2);

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/priority/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: row.id, productId: item.productId, decision, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onSaved();
      if (data.needsEdit) {
        setNeedsEdit(true);
      } else {
        toast({ title: 'Saved — the item is on the buy list' });
        onClose();
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{needsEdit ? 'Now remove it from the order' : 'What did the customer decide?'}</DialogTitle>
          <DialogDescription>#{shortId} · {row.customerName || 'Customer'} — {item.qty}× {item.name} is out of stock.</DialogDescription>
        </DialogHeader>

        {needsEdit ? (
          <div className="space-y-2 text-sm">
            <p>Saved. Open the order, tap <b>Edit</b>, and remove {item.qty}× {item.name} (or lower its quantity). The warehouse can then pack the rest.</p>
            {decision === 'carry_over' && <p className="text-muted-foreground">It is saved as &quot;to follow&quot; on the customer — no need to tick it again in Edit Order.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <RadioGroup value={decision} onValueChange={(v) => setDecision(v as OsDecision)} className="gap-3">
              {(Object.keys(OS_DECISIONS) as OsDecision[]).map((d) => (
                <label key={d} className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value={d} className="mt-0.5" />
                  <span><span className="font-medium">{OS_DECISIONS[d]}</span><br /><span className="text-muted-foreground">{EXPLAIN[d]}</span></span>
                </label>
              ))}
            </RadioGroup>
            <div className="space-y-1.5">
              <Label htmlFor="os-note">What the customer said{decision === 'wait' ? ' (optional)' : ''}</Label>
              <Textarea id="os-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Okay daw less muna, isabay sa next order" />
            </div>
          </div>
        )}

        <DialogFooter>
          {needsEdit ? (
            <>
              <Button variant="outline" onClick={onClose}>Later</Button>
              <Button asChild><Link href={`/dashboard/orders/${row.id}`}>Open order #{shortId}</Link></Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
              <Button onClick={save} disabled={!canSave || isSaving}>{isSaving ? 'Saving…' : 'Save decision'}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
