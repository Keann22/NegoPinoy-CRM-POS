'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CR_OUTCOME_TODO, type CustomerReturn, type CustomerReturnAction } from '@/types/customer-returns.types';

interface Props {
  ret: CustomerReturn | null;
  onClose: () => void;
  onSubmit: (action: CustomerReturnAction) => Promise<void>;
}

const HINTS: Partial<Record<NonNullable<CustomerReturn['outcome']>, { text: string; placeholder: string }>> = {
  reship: { text: 'The order goes back to For Shipping to get a new waybill.', placeholder: 'Optional' },
  replacement: { text: 'Make the replacement order as usual (₱0 if free), then mark it sent here.', placeholder: 'Replacement order # or tracking' },
  full_refund: { text: 'The order is marked Returned so the sale no longer counts.', placeholder: 'How it was paid back (GCash ref, etc.)' },
  partial_refund: { text: 'The customer keeps the item.', placeholder: 'How it was paid back (GCash ref, etc.)' },
  store_credit: { text: 'Note where the credit was recorded.', placeholder: 'Credit details' },
};

/** Marks the decided outcome as carried out (re-shipped, replacement sent, refund sent, ...). */
export function OutcomeDoneDialog({ ret, onClose, onSubmit }: Props) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setNote(''); setError(null); }, [ret]);

  if (!ret?.outcome) return null;
  const todo = CR_OUTCOME_TODO[ret.outcome];
  const hint = HINTS[ret.outcome];
  if (!todo) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ action: 'outcome_done', id: ret.id, note });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!ret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Return #{ret.caseNo}: {todo.label.toLowerCase()}</DialogTitle>
          {hint && <DialogDescription>{hint.text}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="od-note">Note</Label>
          <Textarea id="od-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={hint?.placeholder} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{todo.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
