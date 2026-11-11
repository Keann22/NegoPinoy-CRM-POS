'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, PackageSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { HeldPickerCount } from '@/types/inventory-guardian.types';

/*
 * Owners' card for a picker count that was higher than the shelf number
 * (owner 2026-11-12). The extra pieces were not added; the owners choose:
 * record the purchase (Receiving counts it in), approve it as a counting
 * mistake (the extra is added now), or ignore it.
 */

/** Database times are UTC; show them in Philippine time. */
const pht = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const DONE_TEXT: Record<string, string> = {
  purchase_recorded: 'Purchase recorded',
  approved: 'Approved as a counting mistake',
  dismissed: 'Ignored',
};

export function HeldPickerCountCard({ initial }: { initial: HeldPickerCount }) {
  const { toast } = useToast();
  const [held, setHeld] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const pcs = (n: number) => `${n} ${n === 1 ? 'piece' : 'pieces'}`;

  const act = async (action: 'approve' | 'purchase' | 'dismiss') => {
    setBusy(action);
    try {
      const res = await fetch('/api/inventory/held-picker-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: held.id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save');
      if (json.held) setHeld(json.held);
      toast({
        title: action === 'approve' ? `Added ${pcs(held.extra)} to the shelf` : action === 'purchase' ? 'Marked as recorded' : 'Ignored',
        description: action === 'approve' && held.order
          ? `#${held.order.shortId} can now be picked again.`
          : action === 'purchase' ? 'Receiving counts it in; then the picker can pick the order.' : undefined,
      });
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const open = held.status === 'open';
  const recorded = held.purchasesSince.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <PackageSearch className="h-4 w-4 text-muted-foreground" /> Waiting for you
        {!open && <Badge variant="secondary" className="ml-auto font-normal">{DONE_TEXT[held.status]}</Badge>}
      </div>
      <div className="rounded-md border p-3 text-sm space-y-2">
        <div>
          <span className="font-medium">Not added to stock.</span> {held.pickerName} counted {held.counted} ({pht(held.countedAt)});
          the system had {held.systemHad}. The extra {pcs(held.extra)} {held.extra === 1 ? 'is' : 'are'} on hold.
          {held.order && <> Order #{held.order.shortId} was marked OS for {held.extra === 1 ? 'it' : 'them'} (now <Badge variant="outline" className="font-normal">{held.order.status}</Badge>).</>}
        </div>
        <div>
          <span className="font-medium">Purchases since the count:</span>{' '}
          {recorded
            ? held.purchasesSince.map((p) => `${pht(p.at)} (${p.qty} pcs, ${p.received} received)`).join('; ')
            : 'none recorded yet.'}
        </div>
        {held.shelfNow != null && (
          <Badge variant="secondary" className="font-normal">On the shelf now: {held.shelfNow}</Badge>
        )}

        {open ? (
          <div className="space-y-2 border-t pt-2">
            {recorded ? (
              <Button size="sm" className="w-full" disabled={!!busy} onClick={() => act('purchase')}>
                {busy === 'purchase' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Purchase is recorded: close this
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button asChild size="sm"><Link href="/dashboard/reports/procurement">Record purchase</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/dashboard/inventory/snap-receipt">Snap receipt</Link></Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Bought it? Record the purchase; Receiving counts it in, then the picker picks the order. No receipt? Encode it on the Procurement Sheet.
            </p>
            <Button size="sm" variant="outline" className="w-full whitespace-normal h-auto py-2" disabled={!!busy} onClick={() => act('approve')}>
              {busy === 'approve' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Not a new delivery, the system was wrong: add {pcs(held.extra)}
            </Button>
            <Button size="sm" variant="ghost" className="w-full" disabled={!!busy} onClick={() => act('dismiss')}>
              {busy === 'dismiss' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Wrong item / not real: ignore
            </Button>
          </div>
        ) : (
          held.resolvedBy && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              {DONE_TEXT[held.status]} by {held.resolvedBy}{held.resolvedAt ? ` (${pht(held.resolvedAt)})` : ''}.
            </div>
          )
        )}
      </div>
    </div>
  );
}
