'use client';

import Link from 'next/link';
import { EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUnseenNotes } from '@/hooks/useStaffTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { TaskItem } from './task-item';
import { TASKS_PAGE_PATH } from './tasks-nav-badge';

/**
 * Owners: order notes nobody saw 2 hours after they were sent (owner, 2026-11-25).
 * The sender was told too. Nothing when there are none.
 */
export function UnseenNotesList() {
  const { tasks } = useUnseenNotes(true);
  const owner = useTaskActions('owner');
  if (tasks.length === 0) return null;
  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><EyeOff className="h-5 w-5 text-red-600" /> Notes na hindi pa nakikita (2+ oras) ({tasks.length})</CardTitle>
        <CardDescription>Sent to someone, but nobody tapped Nakita ko or answered yet. The sender was told.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} view="owner" onReply={owner.handlers.onReply} />
        ))}
      </CardContent>
      {owner.dialogs}
    </Card>
  );
}

/** Owners' dashboard: a red line when notes went unseen for 2 hours. Opens the Tasks page. */
export function UnseenNotesAlert() {
  const { tasks } = useUnseenNotes(true);
  if (tasks.length === 0) return null;
  return (
    <Link href={TASKS_PAGE_PATH} className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800 hover:underline dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
      <EyeOff className="h-4 w-4 shrink-0" />
      {tasks.length} note{tasks.length === 1 ? '' : 's'} na hindi pa nakikita (2+ oras): {tasks.slice(0, 3).map((t) => `${t.assignedByName} → ${t.assigneeName}`).join(', ')}
    </Link>
  );
}
