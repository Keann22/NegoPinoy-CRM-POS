'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CR_REFUND_METHODS, CR_WAIVE_METHOD, type CustomerReturn, type CustomerReturnAction } from '@/types/customer-returns.types';

interface Props {
  ret: CustomerReturn | null;
  onClose: () => void;
  onSubmit: (action: CustomerReturnAction) => Promise<void>;
}

/**
 * Owners: record the refund (logged in Expenses as Customer Refund) or give
 * store credit (added to the customer's balance; New Order offers it).
 * A partial refund can also be waived: taken off what the customer still owes.
 */
export function RefundCreditDialog({ ret, onClose, onSubmit }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>('GCash');
  const [waive, setWaive] = useState(false);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ret) return;
    setAmount(ret.amount ? String(ret.amount) : '');
    setMethod('GCash');
    setWaive(false);
    setReference('');
    setNote('');
    setError(null);
  }, [ret]);

  if (!ret) return null;
  const isCredit = ret.outcome === 'store_credit';
  const owed = ret.orderBalance ?? 0;
  const canWaive = ret.outcome === 'partial_refund' && owed > 0;
  const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

  const submit = async () => {
    const value = Number(amount);
    if (!(value > 0)) return setError('Enter the amount.');
    if (waive && value > owed) return setError(`The customer only owes ${peso(owed)}.`);
    setSaving(true);
    setError(null);
    try {
      await onSubmit(isCredit
        ? { action: 'credit_given', id: ret.id, amount: value, note }
        : waive
          ? { action: 'refund_sent', id: ret.id, amount: value, method: CR_WAIVE_METHOD, note }
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
          <DialogTitle>Return #{ret.caseNo}: {isCredit ? 'give store credit' : waive ? 'waive what they owe' : 'refund sent'}</DialogTitle>
          <DialogDescription>
            {isCredit
              ? `Added to ${ret.customerName}'s store credit. New Order offers it on their next order.`
              : waive
                ? `No money goes out. The amount comes off the order as a discount, so the sale and the balance go down (now ${peso(owed)} owed).`
                : ret.outcome === 'full_refund'
                  ? 'Logged in Expenses (Customer Refund) for Cash Flow. The order is marked Returned, so the sale is already out of P&L.'
                  : 'Logged in Expenses as Customer Refund, so Cash Flow and P&L show it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {canWaive && (
            <div className="space-y-1.5">
              <Label>How?</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Button type="button" variant={!waive ? 'default' : 'outline'} className="h-auto flex-col gap-0.5 whitespace-normal py-2" onClick={() => setWaive(false)}>
                  <span className="font-semibold">Sent money back</span>
                  <span className="text-[11px] font-normal opacity-80">GCash, bank, cash</span>
                </Button>
                <Button type="button" variant={waive ? 'default' : 'outline'} className="h-auto flex-col gap-0.5 whitespace-normal py-2"
                  onClick={() => { setWaive(true); setAmount(String(owed)); }}>
                  <span className="font-semibold">Take it off what they owe</span>
                  <span className="text-[11px] font-normal opacity-80">{peso(owed)} still owed</span>
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rc-amount">Amount (₱)</Label>
            <Input id="rc-amount" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          {!isCredit && !waive && (
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
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isCredit ? 'Give credit' : waive ? 'Waive it' : 'Save refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
