'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { CountOutcome, ShelfPrompt } from '@/hooks/picker/useShelfGuard';
import type { WaitingOrder } from '@/types/inventory-guardian.types';
import { ReservedPieceDialog } from './reserved-piece-dialog';
import { OsShelfCheck } from './os-shelf-check';

interface Props {
  prompt: ShelfPrompt | null;
  onCount: (unit1Count: number, opts?: { unit2Empty?: boolean }) => Promise<CountOutcome | undefined>;
  onNotReceived: () => void;
  onBothEmpty: () => Promise<void>;
  onLeaveReserved: () => void;
  onOverrideReserved: (reason: string) => Promise<void>;
  onFindOrders: (pieces: number) => Promise<WaitingOrder[]>;
  onGiveAway: (pieces: number) => Promise<void>;
  onClose: () => void;
}

/** The count was higher than the shelf number: the extra waits for the owners (owner 2026-11-12). */
const HELD_TOAST = {
  title: 'Sent to the owners: not added yet',
  description: "You counted more than the system has. The extra pieces can't be picked until the owners record the purchase. "
    + 'Marked OS: set the pieces aside with the order number and message the owners.',
  duration: 15000,
};

/**
 * Asked when a picker taps Found for more than the shelf has, OS while the
 * shelf should still have some, or Borrow while the shelf still has stock.
 * The count is blind: the system's number isn't shown.
 */
export function ShelfGuardDialog({ prompt, onCount, onNotReceived, onBothEmpty, onLeaveReserved, onOverrideReserved, onFindOrders, onGiveAway, onClose }: Props) {
  const { toast } = useToast();
  const [count, setCount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCount(''); setSaving(false); }, [prompt]);

  if (!prompt) return null;
  if (prompt.kind === 'reserved') {
    return <ReservedPieceDialog prompt={prompt} onLeave={onLeaveReserved} onOverride={onOverrideReserved} onClose={onClose} />;
  }

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await fn();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      setSaving(false);
    }
  };

  const saveCount = () => run(async () => {
    const n = Math.round(Number(count));
    if (count.trim() === '' || !(n >= 0)) throw new Error('Type how many you counted.');
    const outcome = await onCount(n);
    if (outcome === 'reserved') return; // the "reserved for a replacement" dialog takes over
    if (outcome === 'held') return toast(HELD_TOAST);
    toast({
      title: 'Count saved',
      description: outcome === 'found' ? 'Marked Found.' : 'Not enough on the shelf: the rest is marked OS.',
    });
  });

  // Tapped OS but the system says there should be some: the count (everything they found) fixes the number.
  const saveOsCount = (n: number) => run(async () => {
    const needed = prompt?.kind === 'os' ? prompt.needed : 0;
    const outcome = await onCount(n, { unit2Empty: true });
    if (outcome === 'reserved') return;
    if (outcome === 'held') return toast(HELD_TOAST);
    toast({
      title: 'Count saved',
      description: outcome === 'found' ? 'You counted enough for this order: take it from the shelf. Marked Found.'
        : n > 0 ? `${Math.min(n, needed)} Found, the other ${Math.max(0, needed - n)} marked OS. The system number is fixed.`
        : 'Marked OS. The system number is fixed.',
    });
  });

  // Found too few: the pieces go to an order they can finish; this one is OS.
  const giveAway = (n: number, order: WaitingOrder) => run(async () => {
    await onGiveAway(n);
    toast({
      title: `Keep ${n === 1 ? 'it' : `the ${n}`} for #${order.orderId.slice(0, 7).toUpperCase()}`,
      description: `This order is marked OS. Pick #${order.orderId.slice(0, 7).toUpperCase()} (${order.customerName}) next.`,
    });
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        {prompt.kind === 'os' ? (
          <OsShelfCheck key={prompt.rowKey} prompt={prompt} saving={saving} onSave={saveOsCount}
            onFindOrders={onFindOrders} onGiveAway={giveAway} onBack={onClose} />
        ) : prompt.kind === 'count' ? (
          <>
            <DialogHeader>
              <DialogTitle>The system says there isn&apos;t enough on the shelf</DialogTitle>
              <DialogDescription>
                {prompt.productName}: this order needs {prompt.needed}. Where did you get it?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {prompt.deliveryWaiting && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>A delivery of this item is waiting on Receiving</strong> (not counted in yet). If what you&apos;re
                  holding came from that delivery, choose &quot;From a new delivery&quot; below. Count only pieces that were
                  already on the shelf, or they&apos;ll be counted twice when it&apos;s received.
                </div>
              )}
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="sg-count" className="font-semibold">It&apos;s on the shelf: count it</Label>
                <p className="text-xs text-muted-foreground">
                  How many are on the 3C shelf now, including the ones in your hand? Leave out anything from a delivery that isn&apos;t received yet.
                  If you count more than the system has, the extra isn&apos;t added until the owners record the purchase.
                  {prompt.unit2 > 0 && ` 4A reserve is recorded with ${prompt.unit2}: check there too, but leave those out of this count.`}
                </p>
                <div className="flex gap-2">
                  <Input id="sg-count" type="number" inputMode="numeric" min={0} value={count} onChange={(e) => setCount(e.target.value)} className="w-28" />
                  <Button onClick={saveCount} disabled={saving || count.trim() === ''}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save count
                  </Button>
                </div>
              </div>
              <Button variant="outline" className="w-full justify-start h-auto py-2 text-left whitespace-normal" disabled={saving}
                onClick={() => { onNotReceived(); toast({ title: 'Marked OS', description: 'Note it on Receiving ("Arrived but not on the list?") and message the owners to record the purchase.' }); }}>
                From a new delivery that isn&apos;t received yet → mark OS
              </Button>
              <Button variant="ghost" className="w-full justify-start" disabled={saving} onClick={onClose}>
                Not sure: let me check the item again (size, color)
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Check the shelf before borrowing</DialogTitle>
              <DialogDescription>
                The system says there are still {prompt.available} of {prompt.productName} available.
                Look on the 3C shelf{prompt.unit2 > 0 ? ` and in the 4A reserve (${prompt.unit2} there)` : ' and in the 4A reserve'} first.
                4A stock is free to take; borrowing takes another customer&apos;s item.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Button className="w-full" disabled={saving} onClick={onClose}>Found it: go back and tap Found</Button>
              <Button variant="outline" className="w-full whitespace-normal h-auto py-2" disabled={saving} onClick={() => run(onBothEmpty)}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}I checked 3C and 4A: none there → borrow
              </Button>
              <p className="text-xs text-muted-foreground">This is saved as a shelf count of 0.</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
