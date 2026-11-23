'use client';

import { useEffect, useState } from 'react';
import { useMyTasks, useOrderTasks } from '@/hooks/useStaffTasks';
import { TaskItem } from './task-item';
import { TaskDoneDialog } from './task-done-dialog';
import type { StaffTask } from '@/types/staff-tasks.types';

/** Tasks about this order, on the order page. The person it's for can mark it done here. */
export function OrderTasksList({ orderId }: { orderId: string }) {
  const { tasks, reload } = useOrderTasks(orderId);
  const { open: myOpen } = useMyTasks();
  const [doneTask, setDoneTask] = useState<StaffTask | null>(null);

  useEffect(() => {
    const onChange = () => { void reload(); };
    window.addEventListener('staff-tasks-changed', onChange);
    return () => window.removeEventListener('staff-tasks-changed', onChange);
  }, [reload]);

  if (tasks.length === 0) return null;
  const mineIds = new Set(myOpen.map((t) => t.id));

  return (
    <div className="space-y-2 px-6 pb-4">
      <p className="text-sm font-medium text-muted-foreground">Tasks on this order</p>
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} view="owner" onDone={mineIds.has(t.id) ? setDoneTask : undefined} />
      ))}
      <TaskDoneDialog task={doneTask} onOpenChange={(o) => { if (!o) setDoneTask(null); }} onDone={() => void reload()} />
    </div>
  );
}
