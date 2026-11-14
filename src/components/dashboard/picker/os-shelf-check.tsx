'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ShelfPrompt } from '@/hooks/picker/useShelfGuard';
import type { WaitingOrder } from '@/types/inventory-guardian.types';

interface Props {
  prompt: Extract<ShelfPrompt, { kind: 'os' }>;
  saving: boolean;
  onSave: (found: number) => void;
  onFindOrders: (pieces: number) => Promise<WaitingOrder[]>;
  onGiveAway: (pieces: number, order: WaitingOrder) => void;
  onBack: () => void;
}

const shortId = (id: string) => `#${id.slice(0, 7).toUpperCase()}`;

/**
 * Asked when a picker taps OS but the system says the shelf still has some
 * (owner 2026-11-04). The picker looks again, or counts what they can find so the
 * system number gets fixed before OS goes through. The count is blind: no system number.
 * Found some but not enough (2026-11-07): Found for those, OS for the rest, unless
 * the pieces can finish another order: then the picker may give them to that order.
 */
export function OsShelfCheck({ prompt, saving, onSave, onFindOrders, onGiveAway, onBack }: Props) {
  const [count, setCount] = useState('');
  const [unit2Checked, setUnit2Checked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [choice, setChoice] = useState<{ pieces: number; orders: WaitingOrder[] } | null>(null);
  const needsUnit2 = prompt.unit2 > 0;
  const busy = saving || checking;
  const canSave = count.trim() !== '' && Number(count) >= 0 && (!needsUnit2 || unit2Checked) && !busy;

  const save = async () => {
    const n = Math.round(Number(count));
    if (n > 0 && n < prompt.needed) {
      // Too few for this order: could they finish another one instead?
      setChecking(true);
      const orders = await onFindOrders(n);
      setChecking(false);
      if (orders.length > 0) return setChoice({ pieces: n, orders });
    }
    onSave(n);
  };

  if (choice) {
    const { pieces, orders } = choice;
    return (
      <>
        <DialogHeader>
          <DialogTitle>You found {pieces}, this order needs {prompt.needed}</DialogTitle>
          <DialogDescription>
            {prompt.productName}: {pieces === 1 ? 'this piece' : `these ${pieces} pieces`} can finish another order.
            Give {pieces === 1 ? 'it' : 'them'} to that order, or keep {pieces === 1 ? 'it' : 'them'} for this one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.orderId} className="rounded-md border p-3">
              <p className="text-sm font-semibold">{shortId(o.orderId)} · {o.customerName}</p>
              <p className="text-xs text-muted-foreground">
                Needs {o.need}
                {o.status === 'Picked (with issue)' ? ' (was marked OS, waiting to be picked again)' : ''}
                {o.createdAt ? ` · ordered ${new Date(o.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}` : ''}
              </p>
              <Button className="mt-2 w-full whitespace-normal h-auto py-2" disabled={saving} onClick={() => onGiveAway(pieces, o)}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Give to {shortId(o.orderId)}: this order is OS
              </Button>
            </div>
          ))}
          <Button variant="outline" className="w-full whitespace-normal h-auto py-2" disabled={saving} onClick={() => onSave(pieces)}>
            Keep for this order: {pieces} Found, {prompt.needed - pieces} OS
          </Button>
          <Button variant="ghost" className="w-full" disabled={saving} onClick={() => setChoice(null)}>Back</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>The system says this should be on the shelf</DialogTitle>
        <DialogDescription>
          {prompt.productName}: before marking OS, look again on the 3C shelf, in nearby bins and in the 4A reserve.
          Check the size and color too: it may be the wrong variant.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Button className="w-full" disabled={busy} onClick={onBack}>Found all {prompt.needed}: go back and tap Found</Button>

        {prompt.deliveryWaiting && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            A delivery of this item is waiting on Receiving. Pieces still in unopened or uncounted boxes are not on the shelf yet:
            leave them out of the count.
          </div>
        )}

        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor="os-count" className="font-semibold">Found some, or none? Count them</Label>
          <p className="text-xs text-muted-foreground">
            How many did you find in total? Count the ones in your hand, on the 3C shelf, in nearby bins and in 4A.
            Type 0 if there are none. This fixes the system&apos;s number (if you find more than the system has, the extra
            waits for the owners to record the purchase).
          </p>
          {needsUnit2 && (
            <label className="flex items-start gap-2 rounded-md bg-blue-50 p-2 text-xs text-blue-950">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={unit2Checked} onChange={(e) => setUnit2Checked(e.target.checked)} />
              <span>
                4A reserve is recorded with {prompt.unit2}. <strong>I checked 4A too</strong> (any pieces there are in my count).
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <Input id="os-count" type="number" inputMode="numeric" min={0} value={count} onChange={(e) => setCount(e.target.value)} className="w-28" />
            <Button variant="destructive" onClick={save} disabled={!canSave}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save count
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
