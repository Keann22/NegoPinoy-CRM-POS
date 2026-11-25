'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bus, Camera, CheckCircle2, PauseCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { actOnTask, uploadTaskPhoto } from '@/hooks/useStaffTasks';
import { OPEN_ORDER_STATUSES, phtToday, shortPhtDate } from '@/lib/shipping/ship-hold-rules';
import type { StaffTask } from '@/types/staff-tasks.types';

/** Done, with an optional note and photo (or required note when an order has no hold/bus plan yet). */
export function TaskDoneDialog({ task, view = 'staff', onOpenChange, onDone, onHold }: {
  task: StaffTask | null;
  view?: 'staff' | 'owner';
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
  onHold?: (task: StaffTask) => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const isOrderTask = !!task && !task.auto && !task.isNote && !!task.orderId;
  const orderClosed = isOrderTask && !!task.orderStatus && !OPEN_ORDER_STATUSES.includes(task.orderStatus);
  const hold = isOrderTask ? task.orderContext?.hold || null : null;
  const holdExpired = !!hold?.detail && hold.detail.checkOn <= phtToday();
  const hasActivePlan = !!hold && !holdExpired;
  const needsActionWarning = isOrderTask && !!task.orderContext && !orderClosed && !hasActivePlan;
  const needsNote = view === 'staff' && needsActionWarning;
  const canSave = !needsNote || note.trim().length > 0;

  const close = (next: boolean) => {
    if (!next) { setNote(''); setPhoto(null); }
    onOpenChange(next);
  };

  const save = async () => {
    if (!task || !canSave) return;
    setSaving(true);
    try {
      const photoUrl = photo ? await uploadTaskPhoto(photo) : null;
      await actOnTask(task.id, 'done', { note: note.trim(), photoUrl });
      toast({
        title: 'Done',
        description: view === 'owner'
          ? 'Marked done.'
          : task.auto
            ? 'Closed for everyone on the team. The owners can see it.'
            : `${task.assignedByName} will see it's done.`,
      });
      onDone?.();
      close(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Done?</DialogTitle>
          <DialogDescription className="text-base text-foreground">{task?.message}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {orderClosed && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Order {task?.orderShortId} is {task?.orderStatus}.
            </p>
          )}
          {!orderClosed && hasActivePlan && hold && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              {hold.bus
                ? `Marked for bus: "${hold.reason}".`
                : `On hold: "${hold.reason}"${hold.detail?.checkOn ? ` · ask again ${shortPhtDate(hold.detail.checkOn)}` : ''}.`}
            </p>
          )}
          {needsNote && task?.orderId && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  This order has no hold or bus plan yet. If the customer wants to wait, add items, or pay later, update the order first instead of just closing this task.
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {onHold && (
                  <Button type="button" size="sm" variant="outline" className="h-7 bg-background text-xs" onClick={() => onHold(task)}>
                    <PauseCircle className="mr-1 h-3.5 w-3.5" />
                    {hold ? 'Change hold' : "Don't ship yet"}
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" className="h-7 bg-background text-xs" asChild>
                  <Link href={`/dashboard/bus-shipping?mark=${encodeURIComponent(task.orderId)}&task=${encodeURIComponent(task.id)}`} onClick={() => close(false)}>
                    <Bus className="mr-1 h-3.5 w-3.5" /> Ship by bus
                  </Link>
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="task-done-note">{needsNote ? 'What happened on this order?' : 'Note (optional)'}</Label>
            <Textarea
              id="task-done-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={needsNote ? 'e.g. Customer confirmed — ready to ship via SPX' : 'e.g. Shipped by SPX'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-done-photo" className="flex items-center gap-1.5"><Camera className="h-4 w-4" /> Photo (optional)</Label>
            <input
              id="task-done-photo"
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Back</Button>
          <Button onClick={save} disabled={!canSave || saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving…' : 'Done'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
