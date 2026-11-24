'use client';

import { useCallback, useEffect, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePopupSnooze } from '@/hooks/usePopupSnooze';
import { SHIP_HOLDS_CHANGED_EVENT, answerShipHold, fetchShipHoldPrompts } from '@/hooks/useShipHolds';
import { answerPickSkip, fetchPickQuestions } from '@/hooks/usePickSkips';
import { shortPhtDate } from '@/lib/shipping/ship-hold-rules';
import type { PickQuestion, PickSkipAnswer } from '@/types/pick-skips.types';
import type { ShipHoldAnswer, ShipHoldKind, ShipHoldPrompt } from '@/types/ship-holds.types';
import { PickQuestionCard } from './pick-question-card';
import { ShipHoldDialog } from './ship-hold-dialog';
import { ShipHoldPromptCard } from './ship-hold-prompt-card';

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Held orders come back to the sales agent (owner, 2026-11-24): when every order
 * that ships together is packed and paid ("Kumpleto na"), when a payment it
 * waited for came in, or on the check-again date ("Ready na ba?"). Agents don't
 * watch the bell, so it pops up; owners see what's unanswered after 3 days.
 * Also the warehouse's "Hindi pa ipi-pick" questions (2026-11-25): set the
 * ship date or say pick it now.
 */
export function ShipHoldPopup() {
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<ShipHoldPrompt[]>([]);
  const [questions, setQuestions] = useState<PickQuestion[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [editKind, setEditKind] = useState<ShipHoldKind | undefined>(undefined);

  const load = useCallback(() => Promise.all([
    fetchShipHoldPrompts().then(setPrompts),
    fetchPickQuestions().then(setQuestions),
  ]).then(() => undefined), []);
  useEffect(() => {
    fetchShipHoldPrompts().then(setPrompts);
    fetchPickQuestions().then(setQuestions);
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

  const answerQuestion = async (q: PickQuestion, a: PickSkipAnswer) => {
    setBusyId(q.id);
    try {
      await answerPickSkip(q.id, a);
      toast({ title: a === 'pick_now' ? 'Okay, it’s back on Ready to Pick' : 'Okay, we’ll ask again in 4 hours', description: q.customerName });
      await load();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (orderId: string | null, kind?: ShipHoldKind) => { setEditKind(kind); setEditOrderId(orderId); };
  const editDialog = (
    <ShipHoldDialog
      orderId={editOrderId}
      open={!!editOrderId}
      defaultKind={editKind}
      onOpenChange={(o) => { if (!o) setEditOrderId(null); }}
      onSaved={load}
    />
  );

  const total = prompts.length + questions.length;
  if (total === 0) return editDialog;

  if (minimized) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-40 left-4 z-50 inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-emerald-800"
        >
          <PackageCheck className="h-4 w-4" /> {total} held order{total === 1 ? '' : 's'} to check
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
              {complete > 0 ? `${complete} ready to go. ` : ''}Tell us if these can ship now.{prompts.length > 0 ? <> &ldquo;Ready na&rdquo; puts them back on Packed Orders → Ready.</> : null}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {questions.map((q) => (
              <PickQuestionCard
                key={q.id}
                question={q}
                busy={busyId === q.id}
                onAnswer={(a) => answerQuestion(q, a)}
                onSetDate={() => openEdit(q.orderId, 'date')}
              />
            ))}
            {prompts.map((p) => (
              <ShipHoldPromptCard
                key={p.id}
                prompt={p}
                busy={busyId === p.id}
                onAnswer={(a, checkOn) => answer(p, a, checkOn)}
                onEdit={() => openEdit(p.detail.orders[0]?.id || null)}
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
