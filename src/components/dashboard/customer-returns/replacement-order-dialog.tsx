'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CR_SHIPPING_PAYER_LABELS, type CustomerReturn, type CustomerReturnAction } from '@/types/customer-returns.types';

interface Props {
  ret: CustomerReturn | null;
  onClose: () => void;
  onSubmit: (action: CustomerReturnAction) => Promise<void>;
}

/** Pieces to send by default: the damaged ones once checked, otherwise the whole case (re-ship: damaged only). */
function defaultQty(ret: CustomerReturn, i: CustomerReturn['items'][number]): number {
  if (ret.outcome === 'reship' || ret.checkedAt) return i.damagedQty;
  return i.qty;
}

/** Makes the ₱0 replacement order for a case. It then goes to the picker like any order. */
export function ReplacementOrderDialog({ ret, onClose, onSubmit }: Props) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ret) return;
    setQty(Object.fromEntries(ret.items.map((i) => [i.id, String(defaultQty(ret, i))])));
    setNote('');
    setError(null);
  }, [ret]);

  if (!ret) return null;
  const total = ret.items.reduce((s, i) => s + (Number(qty[i.id]) || 0), 0);

  const submit = async () => {
    if (total === 0) return setError('Enter how many pieces to send.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        action: 'replacement_order', id: ret.id, note,
        items: ret.items.map((i) => ({ id: i.id, qty: Math.round(Number(qty[i.id]) || 0) })),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!ret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Return #{ret.caseNo}: replacement order</DialogTitle>
          <DialogDescription>
            Makes a ₱0 order for {ret.customerName}, same address and agent. It goes to the picker and the Priority List like any order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {ret.items.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 rounded border p-2">
              <div className="min-w-0">
                <p className="text-sm leading-tight break-words">{i.productName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {i.qty} in the case{ret.checkedAt ? ` · ${i.damagedQty} damaged` : ''}
                </p>
              </div>
              <Input
                type="number" inputMode="numeric" min={0} max={i.qty} className="w-16 shrink-0"
                value={qty[i.id] ?? ''}
                onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
              />
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Shipping: {ret.shippingPayer ? CR_SHIPPING_PAYER_LABELS[ret.shippingPayer] : 'not set; choose it when booking'}.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="ro-note">Note on the order (optional)</Label>
            <Textarea id="ro-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create order ({total} pc{total === 1 ? '' : 's'})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
