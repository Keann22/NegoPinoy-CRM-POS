'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePopupSnooze } from '@/hooks/usePopupSnooze';
import { answerSupplierPrompt, fetchSupplierPrompts } from '@/hooks/useSupplierFlags';
import { SupplierPromptCard } from './supplier-prompt-card';
import type { SupplierPrompt, SupplierPromptAnswer } from '@/types/supplier-stock.types';

const REFRESH_MS = 5 * 60 * 1000;

const DONE: Record<SupplierPromptAnswer, string> = {
  wait: 'Saved: customer will wait',
  waiting_customer: 'Okay, we’ll ask again in 4 hours',
  editing: 'Change the order, then save it',
  keep_credit: 'Kept as store credit',
  refund: 'Owners told to refund it',
  credit_added: 'Put in store credit',
  handled: 'Saved',
};

/**
 * Orders waiting on an item we can't get from the supplier (owner, 2026-11-20).
 * Sales agents don't watch the bell, so this pops up on every page for the
 * order's agent (owners too after 3 days). It can be minimized but comes back
 * every 30 minutes until each order is answered.
 */
export function SupplierStockPopup() {
  const { toast } = useToast();
  const router = useRouter();
  const [prompts, setPrompts] = useState<SupplierPrompt[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(() => fetchSupplierPrompts().then(setPrompts), []);
  useEffect(() => {
    fetchSupplierPrompts().then(setPrompts);
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);
  const { minimized, setMinimized } = usePopupSnooze('supplier-stock', load);

  if (prompts.length === 0) return null;

  const answer = async (p: SupplierPrompt, a: SupplierPromptAnswer) => {
    if (a === 'credit_added' && !confirm(`Add the ${p.amount.toLocaleString('en-PH')} pesos to ${p.customerName}'s store credit?`)) return;
    setBusyKey(p.key);
    try {
      await answerSupplierPrompt(p.flagId, p.orderId, a);
      toast({ title: DONE[a], description: `${p.customerName} #${p.orderId.slice(0, 7).toUpperCase()}` });
      await load();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusyKey(null);
    }
  };

  /** Change, remove or cancel happens on the order itself; the pop-up checks back in an hour. */
  const openOrder = async (p: SupplierPrompt, edit: boolean) => {
    await answer(p, 'editing');
    setMinimized(true);
    router.push(`/dashboard/orders/${p.orderId}${edit ? '?edit=1' : ''}`);
  };

  // "Later": nothing on screen until the 30 minutes are up (owner, 2026-11-23:
  // the corner button covered the menu and felt like the pop-up never left).
  if (minimized) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) setMinimized(true); }}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <PackageX className="h-5 w-5" /> Out at supplier: ask the customer
          </DialogTitle>
          <DialogDescription>We can&apos;t buy these items right now. Ask each customer, then answer here. Paid orders are first.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {prompts.map((p) => (
            <SupplierPromptCard key={p.key} p={p} busy={busyKey === p.key} onAnswer={answer} onOpenOrder={openOrder} />
          ))}
        </ul>
        <Button variant="ghost" className="w-full" onClick={() => setMinimized(true)}>Later (comes back in 30 minutes)</Button>
      </DialogContent>
    </Dialog>
  );
}
