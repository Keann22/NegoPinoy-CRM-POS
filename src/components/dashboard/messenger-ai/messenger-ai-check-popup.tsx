'use client';

import React, { useState } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePopupSnooze } from '@/hooks/usePopupSnooze';
import { useToast } from '@/hooks/use-toast';
import { useMessengerAiPopup } from '@/hooks/useMessengerAiActions';
import type { CopilotActionPayload, MessengerAiAction, MessengerAiErrorCategory } from '@/types';
import { MessengerAiActionCard } from './messenger-ai-action-card';
import { MessengerAiEditDialog } from './messenger-ai-edit-dialog';
import { MessengerAiRejectDialog } from './messenger-ai-reject-dialog';

/**
 * Sales Verification Pop-up for Messenger AI Copilot.
 * Only surfaces actions whose rule has `show_sales_popup = true` (off by default
 * until owners finish dry-run tuning on /dashboard/approval-queue).
 */
export function MessengerAiCheckPopup() {
  const { toast } = useToast();
  const { actions, busyId, reviewAction, reload } = useMessengerAiPopup();
  const { minimized, setMinimized } = usePopupSnooze('messenger-ai-check', reload);

  const [editing, setEditing] = useState<{ action: MessengerAiAction; payload: CopilotActionPayload } | null>(null);
  const [rejecting, setRejecting] = useState<MessengerAiAction | null>(null);

  if (actions.length === 0) return null;

  const handleConfirm = async (action: MessengerAiAction, payload: CopilotActionPayload) => {
    try {
      const changed = JSON.stringify(payload) !== JSON.stringify(action.proposedPayload);
      const res = await reviewAction({
        actionId: action.id,
        verdict: changed ? 'edited' : 'correct',
        finalPayload: payload,
      });
      toast({
        title: res.appliedSummary || 'Applied & verified',
        description: res.draftReply ? 'Use Copy Reply in Chat / Business Suite to message the customer.' : undefined,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not apply',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const modalDialogs = (
    <>
      <MessengerAiEditDialog
        action={editing?.action ?? null}
        initialPayload={editing?.payload ?? null}
        open={Boolean(editing)}
        busy={Boolean(editing && busyId === editing.action.id)}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSave={async (editedPayload) => {
          if (!editing) return;
          try {
            const res = await reviewAction({
              actionId: editing.action.id,
              verdict: 'edited',
              finalPayload: editedPayload,
            });
            setEditing(null);
            toast({ title: res.appliedSummary || 'Saved & applied' });
          } catch (err) {
            toast({
              variant: 'destructive',
              title: 'Could not apply correction',
              description: err instanceof Error ? err.message : String(err),
            });
          }
        }}
      />
      <MessengerAiRejectDialog
        open={Boolean(rejecting)}
        busy={Boolean(rejecting && busyId === rejecting.id)}
        onOpenChange={(o) => { if (!o) setRejecting(null); }}
        onConfirmReject={async (cat: MessengerAiErrorCategory, note: string | null) => {
          if (!rejecting) return;
          try {
            await reviewAction({
              actionId: rejecting.id,
              verdict: 'rejected',
              errorCategory: cat,
              staffNote: note,
            });
            setRejecting(null);
            toast({ title: 'Marked wrong — AI saved the lesson' });
          } catch (err) {
            toast({
              variant: 'destructive',
              title: 'Could not save',
              description: err instanceof Error ? err.message : String(err),
            });
          }
        }}
      />
    </>
  );

  if (minimized) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-52 left-4 z-50 inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-800"
        >
          <Bot className="h-4 w-4" /> {actions.length} Messenger AI check{actions.length === 1 ? '' : 's'}
        </button>
        {modalDialogs}
      </>
    );
  }

  return (
    <>
      <Dialog open={!editing && !rejecting} onOpenChange={(o) => { if (!o) setMinimized(true); }}>
        <DialogContent
          className="max-h-[90vh] max-w-xl overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Bot className="h-5 w-5" /> Messenger AI Check ({actions.length})
            </DialogTitle>
            <DialogDescription>
              Check the AI&apos;s proposed CRM action from Messenger. Nothing is applied or sent until you tap <b>Tama</b> or <b>Edit</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {actions.map((a) => (
              <MessengerAiActionCard
                key={a.id}
                action={a}
                busy={busyId === a.id}
                onConfirm={(p) => void handleConfirm(a, p)}
                onEdit={(p) => setEditing({ action: a, payload: p })}
                onReject={() => setRejecting(a)}
              />
            ))}
          </div>
          <Button variant="ghost" className="w-full" onClick={() => setMinimized(true)}>
            Later (comes back in 30 minutes)
          </Button>
        </DialogContent>
      </Dialog>
      {modalDialogs}
    </>
  );
}
