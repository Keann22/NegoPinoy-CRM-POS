'use client';

import { useMyTasks, useSentNotes } from '@/hooks/useStaffTasks';
import { isLate } from '@/lib/services/staff-tasks/task-dates';
import { cn } from '@/lib/utils';

export const TASKS_PAGE_PATH = '/dashboard/tasks';

/**
 * Open tasks and notes for me (and unread replies, answers to my notes) next to "Tasks" in the menu, red when one is late. Used instead of
 * a floating corner chip (owner, 2026-11-23: corner buttons covered the menu).
 */
export function TasksNavBadge() {
  const { active: open } = useMyTasks();
  // Answers to my notes count too.
  const { needsMe } = useSentNotes();
  const count = open.length + needsMe.length;
  if (count === 0) return null;
  const late = open.some((t) => t.status === 'open' && isLate(t.dueAt));
  return (
    <span className={cn(
      'ml-auto rounded-full px-2 py-0.5 text-xs font-semibold',
      late ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
    )}>
      {count}
    </span>
  );
}
