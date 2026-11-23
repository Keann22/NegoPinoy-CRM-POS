'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, Eye, EyeOff, Package, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dueLabel, phtWhen } from '@/lib/services/staff-tasks/task-dates';
import type { StaffTask } from '@/types/staff-tasks.types';

interface Props {
  task: StaffTask;
  /** owner: shows who it's for and whether they saw it; staff: shows who it's from. */
  view: 'staff' | 'owner';
  busy?: boolean;
  onSeen?: (t: StaffTask) => void;
  onDone?: (t: StaffTask) => void;
  onCancel?: (t: StaffTask) => void;
  onOpenOrder?: () => void;
}

function Progress({ task }: { task: StaffTask }) {
  if (task.status === 'cancelled') return <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-3.5 w-3.5" />Cancelled</span>;
  if (task.status === 'done' && task.doneAt) {
    return (
      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />Done {phtWhen(task.doneAt)}{task.doneByName ? ` · ${task.doneByName}` : ''}
      </span>
    );
  }
  if (task.seenAt) return <span className="flex items-center gap-1 text-sky-700 dark:text-sky-400"><Eye className="h-3.5 w-3.5" />Seen {phtWhen(task.seenAt)}</span>;
  return <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><EyeOff className="h-3.5 w-3.5" />Not seen yet</span>;
}

/** One task: what to do, the order it's about, the deadline, and its buttons. */
export function TaskItem({ task, view, busy, onSeen, onDone, onCancel, onOpenOrder }: Props) {
  const due = task.dueAt && task.status === 'open' ? dueLabel(task.dueAt) : null;
  const open = task.status === 'open';
  return (
    <div className={cn('space-y-2 rounded-lg border p-3', due?.late && 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30', !open && 'opacity-75')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="whitespace-pre-wrap font-medium">{task.message}</p>
        {due && (
          <Badge variant="outline" className={cn('shrink-0', due.late ? 'border-red-400 text-red-700 dark:text-red-300' : 'text-muted-foreground')}>
            <Clock className="mr-1 h-3 w-3" />{due.text}
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {view === 'owner'
          ? <span>For <span className="font-medium text-foreground">{task.assigneeName}</span> · from {task.assignedByName} · {phtWhen(task.createdAt)}</span>
          : <span>From {task.assignedByName} · {phtWhen(task.createdAt)}</span>}
        {view === 'owner' && <Progress task={task} />}
        {view === 'staff' && !open && <Progress task={task} />}
      </div>

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

      {open && (onSeen || onDone || onCancel) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {onSeen && !task.seenAt && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSeen(task)}>
              <Eye className="mr-1.5 h-4 w-4" />Nakita ko
            </Button>
          )}
          {onDone && (
            <Button size="sm" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onDone(task)}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />Tapos na
            </Button>
          )}
          {onCancel && (
            <Button size="sm" variant="ghost" disabled={busy} className="text-muted-foreground" onClick={() => onCancel(task)}>
              <XCircle className="mr-1.5 h-4 w-4" />Cancel task
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
