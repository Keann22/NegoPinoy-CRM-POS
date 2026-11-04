'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { fetchRtsPrompts, patchCustomerReturn } from '@/hooks/useCustomerReturns';
import type { RtsDecisionPrompt, ShippingPayer } from '@/types/customer-returns.types';

const REOPEN_MS = 30 * 60 * 1000;
const REFRESH_MS = 5 * 60 * 1000;

const phTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Courier returns waiting on this person's answer (owner rule 2026-11-03):
 * the order's agent first, all sales after 2 hours, owners after 3 days.
 * Sales agents don't watch the bell, so this pops up on every page. It can be
 * minimized, but comes back every 30 minutes until answered. "Waiting for
 * customer" hides that parcel for 4 hours.
 */
export function RtsDecisionPopup() {
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<RtsDecisionPrompt[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => setPrompts(await fetchRtsPrompts()), []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!minimized) return;
    const t = setTimeout(() => { setMinimized(false); load(); }, REOPEN_MS);
    return () => clearTimeout(t);
  }, [minimized, load]);

  if (prompts.length === 0) return null;

  const answer = async (p: RtsDecisionPrompt, kind: 'resend' | 'cancel' | 'wait', shippingPayer?: ShippingPayer) => {
    const cancelMsg = p.partial
      ? `${p.customerName} doesn't want ${p.boxNames || 'this box'}? Its items come off the order.`
      : `Cancel ${p.customerName}'s order? The OK pieces go back on the shelf.`;
    if (kind === 'cancel' && !confirm(cancelMsg)) return;
    setBusyId(p.id);
    try {
      await patchCustomerReturn(kind === 'wait'
        ? { action: 'waiting_customer', id: p.id }
        : { action: 'rts_decide', id: p.id, choice: kind, shippingPayer });
      toast({
        title: kind === 'resend' ? 'Resend: the warehouse sends it again' : kind === 'cancel' ? 'Order cancelled' : 'Okay, we’ll ask again in 4 hours',
        description: `${p.customerName} #${p.orderId.slice(0, 7).toUpperCase()}`,
      });
      await load();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-16 left-4 z-50 inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-orange-700"
      >
        <PackageOpen className="h-4 w-4" /> {prompts.length} returned parcel{prompts.length === 1 ? '' : 's'}: resend or cancel?
      </button>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) setMinimized(true); }}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-700">
            <PackageOpen className="h-5 w-5" /> Returned parcel{prompts.length === 1 ? '' : 's'}: resend or cancel?
          </DialogTitle>
          <DialogDescription>The courier brought these back. Ask the customer, then answer here.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {prompts.map((p) => (
            <li key={p.id} className="rounded-md border p-3 space-y-2">
              <div>
                <p className="font-medium leading-tight">
                  {p.customerName}{' '}
                  <Link href={`/dashboard/orders/${p.orderId}`} className="font-mono text-xs text-primary hover:underline">
                    #{p.orderId.slice(0, 7).toUpperCase()}
                  </Link>
                </p>
                {p.partial && <p className="text-xs font-medium text-sky-700">Only {p.boxNames || 'part of the order'} came back; the rest was delivered.</p>}
                <p className="text-xs text-muted-foreground break-words">{p.items}</p>
                <p className="text-xs text-muted-foreground">
                  Back since {phTime(p.loggedAt)}{p.salesPersonName ? ` · agent ${p.salesPersonName}` : ''}
                  {p.waitingCustomerAt ? ` · waiting for the customer since ${phTime(p.waitingCustomerAt)}` : ''}
                </p>
                {p.escalated && <p className="text-xs font-semibold text-red-700">No answer for 3 days: owners, please decide.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {p.partial ? (
                  <>
                    <Button size="sm" disabled={busyId === p.id} onClick={() => answer(p, 'resend', 'customer')}>
                      {busyId === p.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Resend (customer pays shipping)
                    </Button>
                    <Button size="sm" disabled={busyId === p.id} onClick={() => answer(p, 'resend', 'us')}>Resend (free shipping)</Button>
                  </>
                ) : (
                  <Button size="sm" disabled={busyId === p.id} onClick={() => answer(p, 'resend')}>
                    {busyId === p.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Resend
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => answer(p, 'cancel')}>
                  {p.partial ? "Doesn't want this box" : 'Cancel order'}
                </Button>
                <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => answer(p, 'wait')}>Asked customer, waiting for reply</Button>
              </div>
            </li>
          ))}
        </ul>

        <Button variant="ghost" className="w-full" onClick={() => setMinimized(true)}>Later (comes back in 30 minutes)</Button>
      </DialogContent>
    </Dialog>
  );
}
