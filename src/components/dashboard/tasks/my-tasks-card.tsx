'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { actOnTask, useMyTasks } from '@/hooks/useStaffTasks';
import { isLate } from '@/lib/services/staff-tasks/task-dates';
import { TASKS_PAGE_PATH } from './tasks-nav-badge';
import { TaskItem } from './task-item';
import { TaskDoneDialog } from './task-done-dialog';
import type { StaffTask } from '@/types/staff-tasks.types';

/** "Mga task ko" on the dashboard: open tasks from the owners until Done. Nothing when there are none. */
export function MyTasksCard() {
  const { toast } = useToast();
  const { open } = useMyTasks();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneTask, setDoneTask] = useState<StaffTask | null>(null);
  if (open.length === 0) return null;

  // Late first, then by deadline, then newest.
  const sorted = [...open].sort((a, b) => {
    const late = Number(isLate(b.dueAt)) - Number(isLate(a.dueAt));
    if (late) return late;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt || b.dueAt) return a.dueAt ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

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

  return (
    <Card className="border-blue-200 dark:border-blue-900">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-blue-600" /> Mga task ko ({open.length})</CardTitle>
        <CardDescription>From the owners. Tap <b>Tapos na</b> when it&apos;s done. <Link href={TASKS_PAGE_PATH} className="underline">See all</Link></CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((t) => (
          <TaskItem key={t.id} task={t} view="staff" busy={busyId === t.id} onSeen={seen} onDone={setDoneTask} />
        ))}
      </CardContent>
      <TaskDoneDialog task={doneTask} onOpenChange={(o) => { if (!o) setDoneTask(null); }} />
    </Card>
  );
}
