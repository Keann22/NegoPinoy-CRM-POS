'use client';

import Link from 'next/link';
import {
  AlertTriangle, Bus, CalendarClock, CheckCircle2, Clock, Eye, EyeOff, Hammer, MessageCircle, NotebookPen,
  Package, PauseCircle, Users, XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dueLabel, isWaitingDue, isWaitingNow, isWorkingToday, phtWhen, waitingUntil } from '@/lib/services/staff-tasks/task-dates';
import { OPEN_ORDER_STATUSES } from '@/lib/shipping/ship-hold-rules';
import type { StaffTask, StaffTaskProgress, TaskAnswer } from '@/types/staff-tasks.types';
import { ShipContextBlock } from '@/components/dashboard/orders/ship-context-block';
import { TaskAnswerPanel } from './task-answer-panel';

interface Props {
  task: StaffTask;
  /** owner: shows who it's for and whether they saw it; staff: shows who it's from. */
  view: 'staff' | 'owner';
  busy?: boolean;
  onSeen?: (t: StaffTask) => void;
  onProgress?: (t: StaffTask, progress: StaffTaskProgress) => void;
  onDone?: (t: StaffTask) => void;
  onCancel?: (t: StaffTask) => void;
  onReply?: (t: StaffTask) => void;
  onHold?: (t: StaffTask) => void;
  onReschedule?: (t: StaffTask) => void;
  /** Sales / owners: the answer buttons on a task about an order (OK to ship, hasn't replied, cancel). */
  onAnswer?: (t: StaffTask, answer: TaskAnswer) => void;
  onOpenOrder?: () => void;
  /** Same task given to several people: "2 of 3 done". */
  groupProgress?: { done: number; total: number } | null;
}

/** Where the task stands: Not seen yet → Seen → Working on it / Problem → Done. */
function Progress({ task }: { task: StaffTask }) {
  if (task.status === 'cancelled') return <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-3.5 w-3.5" />Cancelled</span>;
  if (task.status === 'done' && task.doneAt) {
    return (
      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />{task.isNote ? (task.needsAnswer ? 'Answered' : 'Seen') : 'Done'} {phtWhen(task.doneAt)}{task.doneByName ? ` · ${task.doneByName}` : ''}
      </span>
    );
  }
  if (task.progress === 'problem' && task.progressAt) {
    return <span className="flex items-center gap-1 font-medium text-orange-700 dark:text-orange-400"><AlertTriangle className="h-3.5 w-3.5" />Problem {phtWhen(task.progressAt)}</span>;
  }
  if (task.progress === 'waiting' && task.progressAt) {
    const until = waitingUntil(task);
    return (
      <span className="flex items-center gap-1 text-sky-700 dark:text-sky-400">
        <Clock className="h-3.5 w-3.5" />
        {isWaitingDue(task) ? `Waiting for customer since ${phtWhen(task.progressAt)} · ask again now` : `Waiting for customer since ${phtWhen(task.progressAt)}${until ? ` · ask again ${phtWhen(until.toISOString())}` : ''}`}
      </span>
    );
  }
  if (task.progress === 'working' && task.progressAt) {
    return <span className="flex items-center gap-1 text-sky-700 dark:text-sky-400"><Hammer className="h-3.5 w-3.5" />Working on it since {phtWhen(task.progressAt)}</span>;
  }
  if (task.seenAt) return <span className="flex items-center gap-1 text-sky-700 dark:text-sky-400"><Eye className="h-3.5 w-3.5" />Seen {phtWhen(task.seenAt)}</span>;
  return <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><EyeOff className="h-3.5 w-3.5" />Not seen yet</span>;
}

/** One task: what to do, the order it's about, the deadline, where it stands, and its buttons. */
export function TaskItem({ task, view, busy, onSeen, onProgress, onDone, onCancel, onReply, onHold, onReschedule, onAnswer, onOpenOrder, groupProgress }: Props) {
  const due = task.dueAt && task.status === 'open' ? dueLabel(task.dueAt) : null;
  const open = task.status === 'open';
  const problem = open && task.progress === 'problem';
  const workingToday = isWorkingToday(task);
  const waitingNow = isWaitingNow(task);
  const paused = workingToday || waitingNow;
  const showRedLate = !!due?.late && !paused;
  const newReply = view === 'staff' ? task.staffUnread : task.ownerUnread;
  const canReply = !!onReply && task.status !== 'cancelled';
  const note = task.isNote;
  const closedOrder = open && !note && !task.auto && !!task.orderId && !!task.orderStatus && !OPEN_ORDER_STATUSES.includes(task.orderStatus);
  // Sales / owners answer for the customer with buttons; the panel replaces Working on it / hold / bus.
  const showAnswers = !!onAnswer && open && !note && !task.auto && !!task.orderId && !!task.orderContext && !closedOrder && !problem;
  return (
    <div className={cn(
      'space-y-2 rounded-lg border p-3',
      note && open && 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30',
      showRedLate && 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30',
      problem && 'border-orange-300 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/30',
      !open && 'opacity-75'
    )}>
      {note && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-300"><NotebookPen className="mr-1 h-3 w-3" />Note</Badge>
          <span className="font-medium text-muted-foreground">{task.needsAnswer ? 'Needs a reply' : 'Just letting you know'}</span>
          {task.unseenTooLong && <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-300">Not seen in 2 hours</Badge>}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="whitespace-pre-wrap font-medium">{task.message}</p>
        {due && (
          <Badge
            variant="outline"
            className={cn(
              'shrink-0',
              due.late && paused
                ? 'border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-300'
                : due.late
                  ? 'border-red-400 text-red-700 dark:text-red-300'
                  : 'text-muted-foreground',
            )}
          >
            <Clock className="mr-1 h-3 w-3" />
            {due.late && waitingNow ? 'Past due · waiting for customer' : due.late && workingToday ? 'Past due · updated today' : due.text}
          </Badge>
        )}
      </div>

      {task.orderId && (
        <Link
          href={`/dashboard/orders/${task.orderId}`}
          onClick={onOpenOrder}
          className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm hover:underline"
        >
          <Package className="h-3.5 w-3.5" />
          <span className="font-semibold">{task.orderShortId}</span>
          {task.orderCustomer && <span>· {task.orderCustomer}</span>}
          {task.orderStatus && <span className="text-muted-foreground">· {task.orderStatus}</span>}
        </Link>
      )}
      {closedOrder && (
        <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Order {task.orderShortId} is now {task.orderStatus} — tap Done if nothing else is needed.
        </p>
      )}
      {open && task.orderContext && (
        <ShipContextBlock
          hold={task.orderContext.hold}
          others={task.orderContext.others}
          self={task.orderContext}
          onNavigate={onOpenOrder}
        />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {view === 'owner'
          ? <span>For <span className="font-medium text-foreground">{task.assigneeName}</span> · from {task.assignedByName} · {phtWhen(task.createdAt)}</span>
          : <span>From {task.assignedByName}{task.auto || task.team ? <> · {task.team ? 'for' : 'shared with'} <span className="font-medium text-foreground">{task.assigneeName}</span></> : null} · {phtWhen(task.createdAt)}</span>}
        {(view === 'owner' || !open || task.progress) && <Progress task={task} />}
        {groupProgress && groupProgress.total > 1 && (
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{groupProgress.done} of {groupProgress.total} done</span>
        )}
        {newReply && <Badge className="bg-blue-600 text-white hover:bg-blue-600">New reply</Badge>}
      </div>

      {open && task.progress && task.progressNote && !(showAnswers && task.progress === 'waiting') && (
        <p className={cn(
          'whitespace-pre-wrap rounded-md p-2 text-sm',
          task.progress === 'problem' ? 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-200' : 'bg-sky-50 dark:bg-sky-950/40'
        )}>
          {view === 'owner' && task.progressByName ? `${task.progressByName}: ` : ''}&ldquo;{task.progressNote}&rdquo;
        </p>
      )}

      {task.status === 'done' && (task.doneNote || task.donePhotoUrl) && (
        <div className="flex items-start gap-2 rounded-md bg-emerald-50 p-2 text-sm dark:bg-emerald-950/40">
          {task.donePhotoUrl && (
            <a href={task.donePhotoUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- photo from the task bucket, any size */}
              <img src={task.donePhotoUrl} alt="Photo of the finished task" className="h-14 w-14 rounded object-cover" />
            </a>
          )}
          {task.doneNote && <p className="whitespace-pre-wrap">&ldquo;{task.doneNote}&rdquo;</p>}
        </div>
      )}

      {showAnswers && onAnswer && (
        <TaskAnswerPanel task={task} busy={busy} onAnswer={onAnswer} onHold={onHold} onOpenOrder={onOpenOrder} />
      )}

      {((open && (onSeen || onProgress || onDone || onCancel || onHold || onReschedule)) || canReply) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {canReply && (
            <Button size="sm" variant={newReply ? 'default' : 'outline'} disabled={busy} onClick={() => onReply?.(task)}>
              <MessageCircle className="mr-1.5 h-4 w-4" />
              {newReply ? 'Read reply' : view === 'staff' ? (note ? 'Answer' : task.messageCount > 0 ? 'Reply' : 'Ask') : 'Reply'}
              {task.messageCount > 0 && <span className="ml-1 opacity-70">({task.messageCount})</span>}
            </Button>
          )}
          {open && onSeen && !task.seenAt && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSeen(task)}>
              <Eye className="mr-1.5 h-4 w-4" />Got it
            </Button>
          )}
          {open && onProgress && !note && !showAnswers && (task.progress !== 'working' || !workingToday) && (
            <Button size="sm" variant="outline" disabled={busy} className="border-sky-300 text-sky-800 dark:text-sky-300" onClick={() => onProgress(task, 'working')}>
              <Hammer className="mr-1.5 h-4 w-4" />{task.progress === 'working' ? 'Update' : 'Working on it'}
            </Button>
          )}
          {open && onProgress && !note && task.progress !== 'problem' && (
            <Button size="sm" variant="outline" disabled={busy} className="border-orange-300 text-orange-800 dark:text-orange-300" onClick={() => onProgress(task, 'problem')}>
              <AlertTriangle className="mr-1.5 h-4 w-4" />Problem
            </Button>
          )}
          {open && !note && !task.auto && !showAnswers && task.orderId && task.orderContext && (
            <>
              {onHold && (
                <Button size="sm" variant="outline" disabled={busy} className="border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300" onClick={() => onHold(task)}>
                  <PauseCircle className="mr-1.5 h-4 w-4" />{task.orderContext.hold ? 'Change hold' : "Don't ship yet"}
                </Button>
              )}
              {!task.orderContext.hold?.bus && (
                <Button size="sm" variant="outline" disabled={busy} asChild>
                  <Link href={`/dashboard/bus-shipping?mark=${encodeURIComponent(task.orderId)}&task=${encodeURIComponent(task.id)}`} onClick={onOpenOrder}>
                    <Bus className="mr-1.5 h-4 w-4" />Ship by bus
                  </Link>
                </Button>
              )}
            </>
          )}
          {open && onReschedule && !note && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onReschedule(task)}>
              <CalendarClock className="mr-1.5 h-4 w-4" />Move deadline
            </Button>
          )}
          {open && onDone && (!note || task.needsAnswer) && (
            showAnswers ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onDone(task)}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />Done (other)
              </Button>
            ) : (
              <Button size="sm" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onDone(task)}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />Done
              </Button>
            )
          )}
          {open && onCancel && (
            <Button size="sm" variant="ghost" disabled={busy} className="text-muted-foreground" onClick={() => onCancel(task)}>
              <XCircle className="mr-1.5 h-4 w-4" />{note ? 'Withdraw' : 'Cancel task'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
