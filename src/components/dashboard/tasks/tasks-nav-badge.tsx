'use client';

import { useMyTasks } from '@/hooks/useStaffTasks';
import { isLate } from '@/lib/services/staff-tasks/task-dates';
import { cn } from '@/lib/utils';

export const TASKS_PAGE_PATH = '/dashboard/tasks';

/**
 * Open-task count next to "Tasks" in the menu, red when one is late. Used instead of
 * a floating corner chip (owner, 2026-11-23: corner buttons covered the menu).
 */
export function TasksNavBadge() {
  const { open } = useMyTasks();
  if (open.length === 0) return null;
  const late = open.some((t) => isLate(t.dueAt));
  return (
    <span className={cn(
      'ml-auto rounded-full px-2 py-0.5 text-xs font-semibold',
      late ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
    )}>
      {open.length}
    </span>
  );
}
