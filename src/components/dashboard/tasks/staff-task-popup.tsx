'use client';

import { usePathname } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePopupSnooze } from '@/hooks/usePopupSnooze';
import { actOnTask, useMyTasks } from '@/hooks/useStaffTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { isLate } from '@/lib/services/staff-tasks/task-dates';
import { TASKS_PAGE_PATH } from './tasks-nav-badge';
import { TaskItem } from './task-item';

/**
 * A task from the owners (owner, 2026-11-23): pops up until the staff member taps
 * "Nakita ko", then it stays on their dashboard until Done. A task past its
 * deadline pops up again, unless they reported a problem (they're waiting on
 * the owners). An owner's reply pops it up again. "Later" hides it for 30 minutes.
 */
export function StaffTaskPopup() {
  const pathname = usePathname();
  const { active, reload } = useMyTasks();
  const { minimized, setMinimized } = usePopupSnooze('staff-tasks', reload);
  const { busyId, handlers, dialogs, dialogOpen } = useTaskActions();

  const shown = active.filter((t) =>
    t.staffUnread || (t.status === 'open' && (!t.seenAt || (isLate(t.dueAt) && t.progress !== 'problem'))));

  if (dialogOpen) return dialogs;
  if (shown.length === 0 || minimized || pathname?.startsWith(TASKS_PAGE_PATH)) return null;

  const anyLate = shown.some((t) => t.status === 'open' && t.seenAt && isLate(t.dueAt));

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
            {anyLate && ' Some are past the deadline: tap Tapos na, or May problema if you can\'t do it.'}
            {shown.some((t) => t.staffUnread) && ' The owner replied: tap Read reply.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {shown.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              view="staff"
              busy={busyId === t.id}
              {...handlers}
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
