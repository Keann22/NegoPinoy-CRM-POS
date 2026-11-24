'use client';

import { useCallback, useEffect, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePopupSnooze } from '@/hooks/usePopupSnooze';
import { SHIP_HOLDS_CHANGED_EVENT, answerShipHold, fetchShipHoldPrompts } from '@/hooks/useShipHolds';
import { shortPhtDate } from '@/lib/shipping/ship-hold-rules';
import type { ShipHoldAnswer, ShipHoldPrompt } from '@/types/ship-holds.types';
import { ShipHoldDialog } from './ship-hold-dialog';
import { ShipHoldPromptCard } from './ship-hold-prompt-card';

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Held orders come back to the sales agent (owner, 2026-11-24): when every order
 * that ships together is packed and paid ("Kumpleto na"), when a payment it
 * waited for came in, or on the check-again date ("Ready na ba?"). Agents don't
 * watch the bell, so it pops up; owners see what's unanswered after 3 days.
 */
export function ShipHoldPopup() {
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<ShipHoldPrompt[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);

  const load = useCallback(() => fetchShipHoldPrompts().then(setPrompts), []);
  useEffect(() => {
    fetchShipHoldPrompts().then(setPrompts);
    const t = setInterval(load, REFRESH_MS);
    window.addEventListener(SHIP_HOLDS_CHANGED_EVENT, load);
    return () => { clearInterval(t); window.removeEventListener(SHIP_HOLDS_CHANGED_EVENT, load); };
  }, [load]);
  const { minimized, setMinimized } = usePopupSnooze('ship-holds', load);

  const answer = async (p: ShipHoldPrompt, a: ShipHoldAnswer, checkOn?: string) => {
    setBusyId(p.id);
    try {
      await answerShipHold(p.id, a, checkOn);
      const titles: Record<ShipHoldAnswer, string> = {
        release: 'Ready to ship: it’s back on Packed Orders → Ready',
        not_yet: `Okay, we’ll ask again on ${checkOn ? shortPhtDate(checkOn) : 'that day'}`,
        waiting: 'Okay, we’ll ask again in 4 hours',
      };
      toast({ title: titles[a], description: p.customerName });
      await load();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const editDialog = (
    <ShipHoldDialog orderId={editOrderId} open={!!editOrderId} onOpenChange={(o) => { if (!o) setEditOrderId(null); }} onSaved={load} />
  );

  if (prompts.length === 0) return editDialog;

  if (minimized) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-40 left-4 z-50 inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-emerald-800"
        >
          <PackageCheck className="h-4 w-4" /> {prompts.length} held order{prompts.length === 1 ? '' : 's'} to check
        </button>
        {editDialog}
      </>
    );
  }

  const complete = prompts.filter((p) => p.reason === 'complete').length;
  return (
    <>
      <Dialog open={!editOrderId} onOpenChange={(o) => { if (!o) setMinimized(true); }}>
        <DialogContent
          className="max-h-[90vh] max-w-lg overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <PackageCheck className="h-5 w-5" /> Naka-hold na orders
            </DialogTitle>
            <DialogDescription>
              {complete > 0 ? `${complete} ready to go. ` : ''}Tell us if these can ship now. &ldquo;Ready na&rdquo; puts them back on Packed Orders → Ready.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {prompts.map((p) => (
              <ShipHoldPromptCard
                key={p.id}
                prompt={p}
                busy={busyId === p.id}
                onAnswer={(a, checkOn) => answer(p, a, checkOn)}
                onEdit={() => setEditOrderId(p.detail.orders[0]?.id || null)}
              />
            ))}
          </ul>
          <Button variant="ghost" className="w-full" onClick={() => setMinimized(true)}>Later (comes back in 30 minutes)</Button>
        </DialogContent>
      </Dialog>
      {editDialog}
    </>
  );
}
