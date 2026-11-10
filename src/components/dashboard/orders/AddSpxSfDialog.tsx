'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCustomerCredit } from '@/hooks/useCustomerCredit';
import { useToast } from '@/hooks/use-toast';
import { Truck, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface AddSpxSfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderShortId?: string;
  onSuccess?: () => void;
}

export function AddSpxSfDialog({
  open,
  onOpenChange,
  orderId,
  orderShortId,
  onSuccess,
}: AddSpxSfDialogProps) {
  const { toast } = useToast();
  const { info: creditInfo, loading: isLoading, refetch } = useCustomerCredit(orderId, open);

  const [shippingFee, setShippingFee] = useState('');
  const [creditToUse, setCreditToUse] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCredit = creditInfo?.storeCredit ?? 0;
  const numFee = Number(shippingFee) || 0;
  const maxCredit = Math.min(numFee, availableCredit);

  // When shipping fee changes, auto-default credit to use to min(fee, availableCredit)
  useEffect(() => {
    if (numFee > 0) {
      setCreditToUse(maxCredit.toString());
    } else {
      setCreditToUse('');
    }
  }, [numFee, maxCredit]);

  const numCreditToUse = Number(creditToUse) || 0;
  const creditLeftAfter = Math.max(0, availableCredit - numCreditToUse);
  const unpaidFee = Math.max(0, numFee - numCreditToUse);

  const handleSubmit = async () => {
    setError(null);
    if (numFee <= 0) {
      setError('Please enter a valid shipping fee greater than ₱0.');
      return;
    }
    if (numCreditToUse <= 0) {
      setError('Store credit to apply must be greater than ₱0.');
      return;
    }
    if (numCreditToUse > availableCredit) {
      setError(`Store credit to use (₱${numCreditToUse.toFixed(2)}) exceeds available credit (₱${availableCredit.toFixed(2)}).`);
      return;
    }
    if (numCreditToUse > numFee) {
      setError(`Store credit to use cannot exceed the shipping fee (₱${numFee.toFixed(2)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/payments/store-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'spx_sf',
          orderId,
          shippingFee: numFee,
          creditToUse: numCreditToUse,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply SPX shipping fee');
      }

      toast({
        title: 'SPX Shipping Fee Added',
        description: `₱${numFee.toFixed(2)} added to order (₱${numCreditToUse.toFixed(2)} paid via store credit). Set to Free Shipping for receiver.`,
      });

      refetch();
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply shipping fee');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Add SPX Shipping Fee (from Credit)
          </DialogTitle>
          <DialogDescription>
            Order #{orderShortId || orderId.substring(0, 7).toUpperCase()} · {creditInfo?.customerName || 'Customer'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive" className="py-2 text-xs">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer:</span>
              <span className="font-semibold">{creditInfo?.customerName || 'Loading...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Available Store Credit:</span>
              <span className="font-bold text-emerald-600">₱{availableCredit.toFixed(2)}</span>
            </div>
            {creditInfo?.hasPendingPayment && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1 pt-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Customer has an unverified payment pending review.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="spx-fee" className="text-xs font-semibold">
              SPX Shipping Fee (₱)
            </Label>
            <Input
              id="spx-fee"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 250.00"
              value={shippingFee}
              onChange={(e) => setShippingFee(e.target.value)}
              disabled={isSubmitting || isLoading}
            />
            <p className="text-[11px] text-muted-foreground">
              Use SPX&apos;s quote for this parcel if you have it. Can only be added once, before the order ships.
            </p>
          </div>

          {numFee > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="credit-use" className="text-xs font-semibold">
                  Store Credit to Deduct (₱)
                </Label>
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setCreditToUse(maxCredit.toString())}
                >
                  Use max (₱{maxCredit.toFixed(2)})
                </button>
              </div>
              <Input
                id="credit-use"
                type="number"
                step="0.01"
                min="0"
                max={availableCredit}
                value={creditToUse}
                onChange={(e) => setCreditToUse(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          )}

          {numFee > 0 && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Shipping Type becomes Free Shipping
              </div>
              <p className="text-[11px] text-muted-foreground">
                SPX bills us for the SF. The SPX file will say &quot;FREE SHIPPING: SF already paid, do not add SF&quot;.
                Whoever books the parcel in SPX must not add the SF to the COD.
              </p>
              <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit Left After:</span>
                  <span className="font-semibold">₱{creditLeftAfter.toFixed(2)}</span>
                </div>
                {unpaidFee > 0.009 && (
                  <>
                    <div className="flex justify-between text-amber-700 dark:text-amber-300 font-semibold">
                      <span>Added to Order Balance:</span>
                      <span>₱{unpaidFee.toFixed(2)}</span>
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      Ask the customer to send ₱{unpaidFee.toFixed(2)} by GCash before Verify Shipping. If it&apos;s
                      still unpaid then, the courier collects it from the receiver.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="spx-note" className="text-xs">
              Note (Optional)
            </Label>
            <Input
              id="spx-note"
              placeholder="e.g. Sender requested Non-COD via SPX"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isLoading || numFee <= 0 || availableCredit <= 0}
          >
            {isSubmitting ? 'Applying...' : 'Confirm SPX SF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
