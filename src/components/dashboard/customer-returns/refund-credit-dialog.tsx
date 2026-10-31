'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CR_REFUND_METHODS, type CustomerReturn, type CustomerReturnAction } from '@/types/customer-returns.types';

interface Props {
  ret: CustomerReturn | null;
  onClose: () => void;
  onSubmit: (action: CustomerReturnAction) => Promise<void>;
}

/**
 * Owners: record the refund (logged in Expenses as Customer Refund) or give
 * store credit (added to the customer's balance; New Order offers it).
 */
export function RefundCreditDialog({ ret, onClose, onSubmit }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>('GCash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ret) return;
    setAmount(ret.amount ? String(ret.amount) : '');
    setMethod('GCash');
    setReference('');
    setNote('');
    setError(null);
  }, [ret]);

  if (!ret) return null;
  const isCredit = ret.outcome === 'store_credit';

  const submit = async () => {
    const value = Number(amount);
    if (!(value > 0)) return setError('Enter the amount.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit(isCredit
        ? { action: 'credit_given', id: ret.id, amount: value, note }
        : { action: 'refund_sent', id: ret.id, amount: value, method, reference, note });
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
          <DialogTitle>Return #{ret.caseNo}: {isCredit ? 'give store credit' : 'refund sent'}</DialogTitle>
          <DialogDescription>
            {isCredit
              ? `Added to ${ret.customerName}'s store credit. New Order offers it on their next order.`
              : ret.outcome === 'full_refund'
                ? 'Logged in Expenses (Customer Refund) for Cash Flow. The order is marked Returned, so the sale is already out of P&L.'
                : 'Logged in Expenses as Customer Refund, so Cash Flow and P&L show it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rc-amount">Amount (₱)</Label>
            <Input id="rc-amount" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          {!isCredit && (
            <>
              <div className="space-y-1.5">
                <Label>Paid by</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CR_REFUND_METHODS.map((m) => (
                    <Button key={m} type="button" variant={method === m ? 'default' : 'outline'} onClick={() => setMethod(m)}>{m}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rc-ref">Reference no. (optional)</Label>
                <Input id="rc-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="GCash / bank reference" />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rc-note">Note (optional)</Label>
            <Textarea id="rc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isCredit ? 'Give credit' : 'Save refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
