'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Eye, EyeOff, Hammer, MessageCircle, Package, Users, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dueLabel, phtWhen } from '@/lib/services/staff-tasks/task-dates';
import type { StaffTask, StaffTaskProgress } from '@/types/staff-tasks.types';
import { ShipContextBlock } from '@/components/dashboard/orders/ship-context-block';

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
        <CheckCircle2 className="h-3.5 w-3.5" />Done {phtWhen(task.doneAt)}{task.doneByName ? ` · ${task.doneByName}` : ''}
      </span>
    );
  }
  if (task.progress === 'problem' && task.progressAt) {
    return <span className="flex items-center gap-1 font-medium text-orange-700 dark:text-orange-400"><AlertTriangle className="h-3.5 w-3.5" />Problem {phtWhen(task.progressAt)}</span>;
  }
  if (task.progress === 'working' && task.progressAt) {
    return <span className="flex items-center gap-1 text-sky-700 dark:text-sky-400"><Hammer className="h-3.5 w-3.5" />Working on it since {phtWhen(task.progressAt)}</span>;
  }
  if (task.seenAt) return <span className="flex items-center gap-1 text-sky-700 dark:text-sky-400"><Eye className="h-3.5 w-3.5" />Seen {phtWhen(task.seenAt)}</span>;
  return <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><EyeOff className="h-3.5 w-3.5" />Not seen yet</span>;
}

/** One task: what to do, the order it's about, the deadline, where it stands, and its buttons. */
export function TaskItem({ task, view, busy, onSeen, onProgress, onDone, onCancel, onReply, onOpenOrder, groupProgress }: Props) {
  const due = task.dueAt && task.status === 'open' ? dueLabel(task.dueAt) : null;
  const open = task.status === 'open';
  const problem = open && task.progress === 'problem';
  const newReply = view === 'staff' ? task.staffUnread : task.ownerUnread;
  const canReply = !!onReply && task.status !== 'cancelled';
  return (
    <div className={cn(
      'space-y-2 rounded-lg border p-3',
      due?.late && 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30',
      problem && 'border-orange-300 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/30',
      !open && 'opacity-75'
    )}>
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
          : <span>From {task.assignedByName}{task.auto ? <> · shared with <span className="font-medium text-foreground">{task.assigneeName}</span></> : null} · {phtWhen(task.createdAt)}</span>}
        {(view === 'owner' || !open || task.progress) && <Progress task={task} />}
        {groupProgress && groupProgress.total > 1 && (
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{groupProgress.done} of {groupProgress.total} done</span>
        )}
        {newReply && <Badge className="bg-blue-600 text-white hover:bg-blue-600">New reply</Badge>}
      </div>

      {open && task.progress && task.progressNote && (
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

      {((open && (onSeen || onProgress || onDone || onCancel)) || canReply) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {canReply && (
            <Button size="sm" variant={newReply ? 'default' : 'outline'} disabled={busy} onClick={() => onReply?.(task)}>
              <MessageCircle className="mr-1.5 h-4 w-4" />
              {newReply ? 'Read reply' : view === 'staff' ? 'Magtanong' : 'Reply'}
              {task.messageCount > 0 && <span className="ml-1 opacity-70">({task.messageCount})</span>}
            </Button>
          )}
          {open && onSeen && !task.seenAt && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSeen(task)}>
              <Eye className="mr-1.5 h-4 w-4" />Nakita ko
            </Button>
          )}
          {open && onProgress && task.progress !== 'working' && (
            <Button size="sm" variant="outline" disabled={busy} className="border-sky-300 text-sky-800 dark:text-sky-300" onClick={() => onProgress(task, 'working')}>
              <Hammer className="mr-1.5 h-4 w-4" />Ginagawa na
            </Button>
          )}
          {open && onProgress && task.progress !== 'problem' && (
            <Button size="sm" variant="outline" disabled={busy} className="border-orange-300 text-orange-800 dark:text-orange-300" onClick={() => onProgress(task, 'problem')}>
              <AlertTriangle className="mr-1.5 h-4 w-4" />May problema
            </Button>
          )}
          {open && onDone && (
            <Button size="sm" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onDone(task)}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />Tapos na
            </Button>
          )}
          {open && onCancel && (
            <Button size="sm" variant="ghost" disabled={busy} className="text-muted-foreground" onClick={() => onCancel(task)}>
              <XCircle className="mr-1.5 h-4 w-4" />Cancel task
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
