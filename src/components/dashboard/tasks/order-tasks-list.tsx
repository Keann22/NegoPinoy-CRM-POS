'use client';

import { useEffect } from 'react';
import { TASKS_CHANGED_EVENT, useMyTasks, useOrderTasks } from '@/hooks/useStaffTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { TaskItem } from './task-item';

/** Tasks about this order, on the order page. The person it's for can update or finish it here. */
export function OrderTasksList({ orderId }: { orderId: string }) {
  const { tasks, reload } = useOrderTasks(orderId);
  const { open: myOpen } = useMyTasks();
  const { busyId, handlers, dialogs } = useTaskActions();

  useEffect(() => {
    const onChange = () => { void reload(); };
    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, onChange);
  }, [reload]);

  if (tasks.length === 0) return null;
  const mineIds = new Set(myOpen.map((t) => t.id));

  return (
    <div className="space-y-2 px-6 pb-4">
      <p className="text-sm font-medium text-muted-foreground">Tasks on this order</p>
      {tasks.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          view="owner"
          busy={busyId === t.id}
          {...(mineIds.has(t.id) ? handlers : {})}
        />
      ))}
      {dialogs}
    </div>
  );
}
