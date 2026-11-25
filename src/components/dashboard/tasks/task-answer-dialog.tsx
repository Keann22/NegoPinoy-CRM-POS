'use client';

import { useState } from 'react';
import { Clock, Truck, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { reloadMyTasks, TASKS_CHANGED_EVENT } from '@/hooks/useStaffTasks';
import { WAIT_HOURS } from '@/lib/services/staff-tasks/task-dates';
import type { StaffTask, TaskAnswer } from '@/types/staff-tasks.types';

export interface AnswerTarget { task: StaffTask; answer: TaskAnswer }

const WAIT_QUICK = ['Asked customer, waiting for reply', 'Customer will reply later today', 'Seen, no reply yet'];
const CANCEL_QUICK = ['Customer doesn\'t want it anymore', 'No reply for weeks', 'Customer ordered by mistake'];

const COPY: Record<TaskAnswer, { title: string; label: string; placeholder: string; save: string; required: boolean }> = {
  ok_to_ship: {
    title: 'OK to ship',
    label: 'Note (optional)',
    placeholder: 'e.g. Customer confirmed the address, COD',
    save: 'OK to ship',
    required: false,
  },
  waiting: {
    title: 'Customer hasn\'t replied',
    label: 'What did you ask?',
    placeholder: 'e.g. Asked if she still wants it, waiting for reply',
    save: `Ask me again in ${WAIT_HOURS} hours`,
    required: false,
  },
  cancel: {
    title: 'Cancel the order',
    label: 'Why? (what the customer said)',
    placeholder: 'e.g. Customer said she doesn\'t need it anymore',
    save: 'Cancel the order',
    required: true,
  },
};

async function postAnswer(taskId: string, answer: TaskAnswer, note: string): Promise<string> {
  const res = await fetch('/api/tasks/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, answer, note }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Not saved');
  await reloadMyTasks();
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
  return String(json.outcome || 'Saved');
}

/** The note step behind an answer button: OK to ship / Customer hasn't replied / Cancel the order. */
export function TaskAnswerDialog({ target, onOpenChange, onDone }: {
  target: AnswerTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const answer = target?.answer || 'ok_to_ship';
  const copy = COPY[answer];
  const hold = target?.task.orderContext?.hold || null;
  const canSave = !copy.required || note.trim().length > 0;
  const quick = answer === 'waiting' ? WAIT_QUICK : answer === 'cancel' ? CANCEL_QUICK : [];

  const close = (next: boolean) => {
    if (!next) setNote('');
    onOpenChange(next);
  };

  const save = async () => {
    if (!target || !canSave) return;
    setSaving(true);
    try {
      const outcome = await postAnswer(target.task.id, answer, note.trim());
      toast({ title: copy.title, description: outcome });
      onDone?.();
      close(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const Icon = answer === 'cancel' ? XCircle : answer === 'waiting' ? Clock : Truck;
  return (
    <Dialog open={!!target} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={answer === 'cancel' ? 'h-5 w-5 text-red-600' : answer === 'waiting' ? 'h-5 w-5 text-sky-600' : 'h-5 w-5 text-emerald-600'} />
            {copy.title}
            {target?.task.orderShortId && <span className="text-sm font-normal text-muted-foreground">{target.task.orderShortId}{target.task.orderCustomer ? ` · ${target.task.orderCustomer}` : ''}</span>}
          </DialogTitle>
          <DialogDescription className="text-sm text-foreground">{target?.task.message}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {answer === 'ok_to_ship' && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              {hold
                ? `The hold ("${hold.reason}") is released and the order goes back to Ready to ship. The task closes.`
                : 'The task closes with "OK to ship" as the answer.'}
            </p>
          )}
          {answer === 'waiting' && (
            <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
              The task stays open but isn&apos;t late while you wait. In {WAIT_HOURS} hours it pops up again: &ldquo;Customer replied yet?&rdquo;
            </p>
          )}
          {answer === 'cancel' && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-200">
              Unpaid: the order is cancelled now (if it was picked, the warehouse gets a task to put the pieces back).
              If the customer already paid, it isn&apos;t cancelled here: the owners are told so they decide store credit or refund.
            </p>
          )}
          {quick.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button key={q} type="button" onClick={() => setNote(q)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted">
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="task-answer-note">{copy.label}</Label>
            <Textarea id="task-answer-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={copy.placeholder} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>Back</Button>
          <Button
            onClick={save}
            disabled={!canSave || saving}
            className={answer === 'cancel' ? 'bg-red-600 hover:bg-red-700' : answer === 'waiting' ? '' : 'bg-emerald-600 hover:bg-emerald-700'}
          >
            {saving ? 'Saving…' : copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
