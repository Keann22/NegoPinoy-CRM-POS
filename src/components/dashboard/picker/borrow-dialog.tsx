'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { BorrowCandidate } from '@/lib/services/borrow-service';

export interface BorrowTarget {
  rowKey: string;
  productId: string;
  productName: string;
  /** How many this order is missing. */
  missingQty: number;
}

interface Props {
  target: BorrowTarget | null;
  toOrderId: string | null;
  onClose: () => void;
  /** Called after a successful borrow with how many were borrowed and from which order. */
  onBorrowed: (target: BorrowTarget, qty: number, fromShortId: string) => void;
}

/**
 * Take an item that was already picked for another order. The other order is
 * reopened as short on it and a replacement is requested automatically.
 */
export function BorrowDialog({ target, toOrderId, onClose, onBorrowed }: Props) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<BorrowCandidate[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCandidates(null);
    setConfirming(null);
    if (!target || !toOrderId) return;
    let cancelled = false;
    fetch(`/api/picker/borrow?productId=${target.productId}&toOrderId=${toOrderId}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!cancelled) setCandidates(d.candidates);
      })
      .catch((e) => {
        if (!cancelled) setCandidates([]);
        toast({ variant: 'destructive', title: 'Could not load orders', description: e.message });
      });
    return () => { cancelled = true; };
  }, [target, toOrderId, toast]);

  if (!target || !toOrderId) return null;

  const borrow = async (c: BorrowCandidate) => {
    if (c.warnings.length > 0 && confirming !== c.orderId) {
      setConfirming(c.orderId);
      return;
    }
    const qty = Math.min(target.missingQty, c.qty);
    setSaving(true);
    try {
      const res = await fetch('/api/picker/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: target.productId, qty, fromOrderId: c.orderId, toOrderId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save');
      toast({ title: `Borrowed ${qty}× from #${d.fromShortId}`, description: `#${d.fromShortId} is now waiting for a replacement, and its sales person was told.` });
      onBorrowed(target, qty, d.fromShortId);
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not borrow', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Borrow from another order</DialogTitle>
          <DialogDescription>
            {target.missingQty}× {target.productName}. Take it from an order that was already picked. That order goes back to
            &quot;Picked (with issue)&quot;, a replacement is requested, and its sales person is told.
          </DialogDescription>
        </DialogHeader>

        {candidates === null ? (
          <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : candidates.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No picked order is holding this item. Mark it OS.
          </p>
        ) : (
          <ul className="space-y-2">
            {candidates.map((c, i) => {
              const isConfirming = confirming === c.orderId;
              return (
                <li key={c.orderId} className={cn('rounded-md border p-3 text-sm', c.warnings.length > 0 && 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/30')}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">#{c.shortId} {i === 0 && c.warnings.length === 0 && <span className="ml-1 rounded bg-green-100 px-1.5 text-[11px] font-medium text-green-800">Best choice</span>}</span>
                    <span className="text-xs text-muted-foreground">{c.status} · has {c.qty}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{c.customerName || 'Customer'} · {c.salesPersonName || '—'} · {c.paymentMethod || '—'} · ordered {c.daysSinceOrder}d ago</div>
                  {c.warnings.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-900 dark:text-amber-200">
                      {c.warnings.map((w) => <li key={w} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}
                    </ul>
                  )}
                  <Button size="sm" className="mt-2 h-8 w-full" variant={isConfirming ? 'destructive' : 'outline'} disabled={saving} onClick={() => borrow(c)}>
                    {isConfirming ? `Yes, borrow from #${c.shortId} anyway` : `Borrow ${Math.min(target.missingQty, c.qty)} from #${c.shortId}`}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
