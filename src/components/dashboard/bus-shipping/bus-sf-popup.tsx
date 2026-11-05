'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Bus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { answerBusSfPrompt, fetchBusSfPrompts } from '@/hooks/useBusShipping';
import type { BusSfAnswer, BusSfPrompt } from '@/types/bus-shipping.types';

const REOPEN_MS = 30 * 60 * 1000;
const REFRESH_MS = 5 * 60 * 1000;
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const phTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * After a bus fee is recorded (owner, 2026-11-05): the order's sales agent
 * collects SF the customer still owes, or decides what happens to SF they sent
 * extra. Agents don't watch the bell, so it pops up (like returned parcels).
 * "Owed" goes away by itself once the payment is logged.
 */
export function BusSfPopup() {
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<BusSfPrompt[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => fetchBusSfPrompts().then(setPrompts), []);
  useEffect(() => {
    fetchBusSfPrompts().then(setPrompts);
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!minimized) return;
    const t = setTimeout(() => { setMinimized(false); load(); }, REOPEN_MS);
    return () => clearTimeout(t);
  }, [minimized, load]);

  if (prompts.length === 0) return null;

  const answer = async (p: BusSfPrompt, a: BusSfAnswer) => {
    setBusyId(p.id);
    try {
      await answerBusSfPrompt(p.id, a);
      const titles: Record<BusSfAnswer, string> = {
        waiting: 'Okay, we’ll ask again in 4 hours',
        keep_credit: 'Kept as store credit',
        tip: 'Recorded as a tip',
        refund: 'Owners told to refund it',
      };
      toast({ title: titles[a], description: p.customerName });
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
        className="fixed bottom-28 left-4 z-50 inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-sky-800"
      >
        <Bus className="h-4 w-4" /> {prompts.length} bus SF to settle
      </button>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) setMinimized(true); }}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sky-800 dark:text-sky-300">
            <Bus className="h-5 w-5" /> Bus shipping fee
          </DialogTitle>
          <DialogDescription>These went out by bus. We paid the bus company; settle the SF with the customer.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {prompts.map((p) => (
            <li key={p.id} className="space-y-2 rounded-md border p-3">
              <div className="text-sm">
                <p className="font-medium">
                  {p.customerName}{' '}
                  {p.orderIds.map((id) => (
                    <Link key={id} href={`/dashboard/orders/${id}`} className="mr-1 font-mono text-xs text-primary hover:underline">
                      #{id.slice(0, 7).toUpperCase()}
                    </Link>
                  ))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.busCompany} → {p.destination} · fee {peso(p.fee)} · {phTime(p.shippedAt)}
                </p>
                {p.kind === 'owed' ? (
                  <p className="pt-1 font-semibold text-amber-700 dark:text-amber-400">
                    Collect {peso(p.amount)} SF. Log the payment on the order; this goes away by itself.
                  </p>
                ) : (
                  <p className="pt-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    Customer sent {peso(p.amount)} more than the SF. It is in their store credit now.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {p.kind === 'owed' ? (
                  <>
                    <Button size="sm" asChild>
                      <Link href={`/dashboard/orders/${p.orderIds[0]}`}>Open order to log payment</Link>
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => answer(p, 'waiting')}>
                      {busyId === p.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Asked customer, waiting
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" disabled={busyId === p.id} onClick={() => answer(p, 'keep_credit')}>
                      {busyId === p.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Keep as store credit
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => answer(p, 'tip')}>Tip / keep the change</Button>
                    <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => answer(p, 'refund')}>Refund (tell owners)</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Button variant="ghost" className="w-full" onClick={() => setMinimized(true)}>Later (comes back in 30 minutes)</Button>
      </DialogContent>
    </Dialog>
  );
}
