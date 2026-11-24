'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { actOnTask } from '@/hooks/useStaffTasks';
import { TaskThreadDialog } from '@/components/dashboard/tasks/task-thread-dialog';
import type { StaffTask } from '@/types/staff-tasks.types';

/**
 * Buttons on a note I sent (Read answer / Ok / Bawiin) and the replies dialog,
 * shared by the pop-up and the Tasks page. Render `dialogs` once.
 */
export function useSentNoteActions() {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [thread, setThread] = useState<StaffTask | null>(null);

  const run = async (n: StaffTask, action: 'ack' | 'cancel') => {
    setBusyId(n.id);
    try {
      await actOnTask(n.id, action);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const handlers = {
    onRead: (n: StaffTask) => setThread(n),
    onAck: (n: StaffTask) => { void run(n, 'ack'); },
    onCancel: (n: StaffTask) => {
      if (window.confirm('Bawiin ang note? Mawawala ito sa kanila (nasa order notes pa rin).')) void run(n, 'cancel');
    },
  };

  const dialogs = (
    <TaskThreadDialog task={thread} view="owner" onOpenChange={(o) => { if (!o) setThread(null); }} />
  );

  return { busyId, handlers, dialogs, dialogOpen: !!thread };
}
