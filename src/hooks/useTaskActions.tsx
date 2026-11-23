'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { actOnTask } from '@/hooks/useStaffTasks';
import { TaskDoneDialog } from '@/components/dashboard/tasks/task-done-dialog';
import { TaskProgressDialog, type ProgressTarget } from '@/components/dashboard/tasks/task-progress-dialog';
import { TaskThreadDialog } from '@/components/dashboard/tasks/task-thread-dialog';
import type { StaffTask, StaffTaskProgress } from '@/types/staff-tasks.types';

/**
 * The buttons on a task (Nakita ko / Ginagawa na / May problema / Tapos na / Reply)
 * and their dialogs, shared by the pop-up, dashboard card, Tasks page and order page.
 * Render `dialogs` once; pass `handlers` to each TaskItem.
 */
export function useTaskActions(view: 'staff' | 'owner' = 'staff', onChanged?: () => void) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneTask, setDoneTask] = useState<StaffTask | null>(null);
  const [progressTarget, setProgressTarget] = useState<ProgressTarget | null>(null);
  const [replyTask, setReplyTask] = useState<StaffTask | null>(null);

  const onSeen = async (t: StaffTask) => {
    setBusyId(t.id);
    try {
      await actOnTask(t.id, 'seen');
      onChanged?.();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const handlers = {
    onSeen,
    onDone: (t: StaffTask) => setDoneTask(t),
    onProgress: (t: StaffTask, progress: StaffTaskProgress) => setProgressTarget({ task: t, progress }),
    onReply: (t: StaffTask) => setReplyTask(t),
  };

  const dialogs = (
    <>
      <TaskDoneDialog task={doneTask} onOpenChange={(o) => { if (!o) setDoneTask(null); }} onDone={onChanged} />
      <TaskProgressDialog target={progressTarget} onOpenChange={(o) => { if (!o) { setProgressTarget(null); onChanged?.(); } }} />
      <TaskThreadDialog task={replyTask} view={view} onOpenChange={(o) => { if (!o) setReplyTask(null); }} />
    </>
  );

  return { busyId, handlers, dialogs, dialogOpen: !!doneTask || !!progressTarget || !!replyTask };
}
