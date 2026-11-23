'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePopupSnooze } from '@/hooks/usePopupSnooze';
import { actOnTask, useMyTasks } from '@/hooks/useStaffTasks';
import { isLate } from '@/lib/services/staff-tasks/task-dates';
import { TASKS_PAGE_PATH } from './tasks-nav-badge';
import { TaskItem } from './task-item';
import { TaskDoneDialog } from './task-done-dialog';
import type { StaffTask } from '@/types/staff-tasks.types';

/**
 * A task from the owners (owner, 2026-11-23): pops up until the staff member taps
 * "Nakita ko", then it stays on their dashboard until Done. A task past its
 * deadline pops up again. "Later" hides it for 30 minutes.
 */
export function StaffTaskPopup() {
  const pathname = usePathname();
  const { toast } = useToast();
  const { open, reload } = useMyTasks();
  const { minimized, setMinimized } = usePopupSnooze('staff-tasks', reload);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneTask, setDoneTask] = useState<StaffTask | null>(null);

  const shown = open.filter((t) => !t.seenAt || isLate(t.dueAt));

  const seen = async (t: StaffTask) => {
    setBusyId(t.id);
    try {
      await actOnTask(t.id, 'seen');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
    }
  };

  if (doneTask) return <TaskDoneDialog task={doneTask} onOpenChange={(o) => { if (!o) setDoneTask(null); }} />;
  if (shown.length === 0 || minimized || pathname?.startsWith(TASKS_PAGE_PATH)) return null;

  const anyLate = shown.some((t) => t.seenAt && isLate(t.dueAt));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) setMinimized(true); }}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <ClipboardCheck className="h-5 w-5" /> {shown.length === 1 ? 'May task ka' : `${shown.length} task para sa iyo`}
          </DialogTitle>
          <DialogDescription>
            Tap <b>Nakita ko</b> so the owners know you saw it. It stays on your dashboard until you tap <b>Tapos na</b>.
            {anyLate && ' Some are past the deadline.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {shown.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              view="staff"
              busy={busyId === t.id}
              onSeen={seen}
              onDone={setDoneTask}
              // Opening the order counts as seeing the task.
              onOpenOrder={() => { if (!t.seenAt) void actOnTask(t.id, 'seen').catch(() => undefined); setMinimized(true); }}
            />
          ))}
        </div>
        <Button variant="ghost" className="w-full" onClick={() => setMinimized(true)}>Later (comes back in 30 minutes)</Button>
      </DialogContent>
    </Dialog>
  );
}
