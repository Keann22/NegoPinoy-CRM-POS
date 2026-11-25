'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { actOnTask } from '@/hooks/useStaffTasks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { TaskAnswerDialog, type AnswerTarget } from '@/components/dashboard/tasks/task-answer-dialog';
import { TaskDoneDialog } from '@/components/dashboard/tasks/task-done-dialog';
import { TaskProgressDialog, type ProgressTarget } from '@/components/dashboard/tasks/task-progress-dialog';
import { TaskRescheduleDialog } from '@/components/dashboard/tasks/task-reschedule-dialog';
import { TaskThreadDialog } from '@/components/dashboard/tasks/task-thread-dialog';
import { ShipHoldDialog } from '@/components/dashboard/ship-holds/ship-hold-dialog';
import type { StaffTask, StaffTaskProgress, TaskAnswer } from '@/types/staff-tasks.types';

/**
 * The buttons on a task (Got it / Working on it / Problem / Done / Reply / Don't ship yet)
 * and their dialogs, shared by the pop-up, dashboard card, Tasks page and order page.
 * Render `dialogs` once; pass `handlers` to each TaskItem.
 */
export function useTaskActions(view: 'staff' | 'owner' = 'staff', onChanged?: () => void) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneTask, setDoneTask] = useState<StaffTask | null>(null);
  const [progressTarget, setProgressTarget] = useState<ProgressTarget | null>(null);
  const [replyTask, setReplyTask] = useState<StaffTask | null>(null);
  const [holdTask, setHoldTask] = useState<StaffTask | null>(null);
  const [rescheduleTask, setRescheduleTask] = useState<StaffTask | null>(null);
  const [answerTarget, setAnswerTarget] = useState<AnswerTarget | null>(null);
  // Answer buttons (OK to ship / hasn't replied / cancel) are for the people who talk to the customer.
  const { userProfile } = useUserProfile();
  const canAnswer = view === 'staff' && !!userProfile?.roles.some((r) => r === 'Sales' || r === 'Admin' || r === 'Owner');

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

  const switchToHold = (t: StaffTask) => {
    setDoneTask(null);
    setReplyTask(null);
    setHoldTask(t);
  };

  const handlers = {
    onSeen,
    onDone: (t: StaffTask) => setDoneTask(t),
    onProgress: (t: StaffTask, progress: StaffTaskProgress) => setProgressTarget({ task: t, progress }),
    onReply: (t: StaffTask) => setReplyTask(t),
    onHold: (t: StaffTask) => setHoldTask(t),
    ...(view === 'owner' ? { onReschedule: (t: StaffTask) => setRescheduleTask(t) } : {}),
    ...(canAnswer ? { onAnswer: (t: StaffTask, answer: TaskAnswer) => setAnswerTarget({ task: t, answer }) } : {}),
  };

  const dialogs = (
    <>
      <TaskDoneDialog
        task={doneTask}
        view={view}
        onOpenChange={(o) => { if (!o) setDoneTask(null); }}
        onDone={onChanged}
        onHold={switchToHold}
      />
      <TaskProgressDialog target={progressTarget} onOpenChange={(o) => { if (!o) { setProgressTarget(null); onChanged?.(); } }} />
      <TaskThreadDialog
        task={replyTask}
        view={view}
        onOpenChange={(o) => { if (!o) setReplyTask(null); }}
        onHold={switchToHold}
      />
      <ShipHoldDialog
        orderId={holdTask?.orderId ?? null}
        open={!!holdTask}
        onOpenChange={(o) => { if (!o) setHoldTask(null); }}
        task={holdTask ? { id: holdTask.id, message: holdTask.message, assigneeName: view === 'owner' ? holdTask.assigneeName : undefined } : null}
        onSaved={onChanged}
      />
      <TaskRescheduleDialog
        task={view === 'owner' ? rescheduleTask : null}
        onOpenChange={(o) => { if (!o) setRescheduleTask(null); }}
        onSaved={onChanged}
      />
      <TaskAnswerDialog
        target={answerTarget}
        onOpenChange={(o) => { if (!o) setAnswerTarget(null); }}
        onDone={onChanged}
      />
    </>
  );

  return {
    busyId,
    handlers,
    dialogs,
    dialogOpen: !!doneTask || !!progressTarget || !!replyTask || !!holdTask || !!rescheduleTask || !!answerTarget,
  };
}
