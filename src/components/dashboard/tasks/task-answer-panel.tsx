'use client';

import Link from 'next/link';
import { Bus, Clock, PauseCircle, Truck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isWaitingDue, phtWhen, waitingUntil } from '@/lib/services/staff-tasks/task-dates';
import type { StaffTask, TaskAnswer } from '@/types/staff-tasks.types';

/**
 * "What did the customer say?": one row of answers on a sales task about an
 * order (owner, 2026-11-25). Every button changes the order and closes the task,
 * so nobody has to explain it in a reply.
 */
export function TaskAnswerPanel({ task, busy, onAnswer, onHold, onOpenOrder }: {
  task: StaffTask;
  busy?: boolean;
  onAnswer: (t: StaffTask, answer: TaskAnswer) => void;
  onHold?: (t: StaffTask) => void;
  onOpenOrder?: () => void;
}) {
  const hold = task.orderContext?.hold || null;
  const until = waitingUntil(task);
  const due = isWaitingDue(task);
  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
      <p className="text-xs font-semibold">
        {due ? 'Customer replied yet? Pick the answer:' : 'What did the customer say? Pick the answer:'}
      </p>
      {/* When and until when is on the status line above; here, what was asked. */}
      {until && task.progressNote && (
        <p className="flex items-center gap-1 text-xs text-sky-800 dark:text-sky-300">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {due ? `Asked ${phtWhen(task.progressAt!)}` : 'You noted'}: &ldquo;{task.progressNote}&rdquo;
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onAnswer(task, 'ok_to_ship')}>
          <Truck className="mr-1.5 h-4 w-4" />OK to ship
        </Button>
        {onHold && (
          <Button size="sm" variant="outline" disabled={busy} className="border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300" onClick={() => onHold(task)}>
            <PauseCircle className="mr-1.5 h-4 w-4" />{hold && !hold.bus ? 'Change hold' : 'Don’t ship yet'}
          </Button>
        )}
        {!hold?.bus && task.orderId && (
          <Button size="sm" variant="outline" disabled={busy} asChild>
            <Link href={`/dashboard/bus-shipping?mark=${encodeURIComponent(task.orderId)}&task=${encodeURIComponent(task.id)}`} onClick={onOpenOrder}>
              <Bus className="mr-1.5 h-4 w-4" />Ship by bus
            </Link>
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} className="border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-300" onClick={() => onAnswer(task, 'waiting')}>
          <Clock className="mr-1.5 h-4 w-4" />{until ? 'Still no reply' : 'Customer hasn’t replied'}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} className="border-red-300 text-red-700 dark:border-red-900 dark:text-red-300" onClick={() => onAnswer(task, 'cancel')}>
          <XCircle className="mr-1.5 h-4 w-4" />Cancel the order
        </Button>
      </div>
    </div>
  );
}
