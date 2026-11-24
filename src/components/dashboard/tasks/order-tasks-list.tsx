'use client';

import { useEffect } from 'react';
import { TASKS_CHANGED_EVENT, useMyTasks, useOrderTasks, useSentNotes } from '@/hooks/useStaffTasks';
import { useSentNoteActions } from '@/hooks/useSentNoteActions';
import { useTaskActions } from '@/hooks/useTaskActions';
import { useUserProfile } from '@/hooks/useUserProfile';
import { TaskItem } from './task-item';

/**
 * Tasks and notes about this order, on the order page. The person it's for can
 * update, answer or finish it here. `openNotesOnly` (Picker): just the notes
 * still waiting, so the warehouse sees them when they scan the order.
 */
export function OrderTasksList({ orderId, openNotesOnly = false }: { orderId: string; openNotesOnly?: boolean }) {
  const { tasks: all, reload } = useOrderTasks(orderId);
  const { open: myOpen } = useMyTasks();
  const { notes: sent } = useSentNotes();
  const sender = useSentNoteActions();
  const tasks = openNotesOnly ? all.filter((t) => t.isNote && t.status === 'open') : all;
  const staff = useTaskActions('staff');
  const owner = useTaskActions('owner');
  const { userProfile } = useUserProfile();
  const isManagement = (userProfile?.roles || []).some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));

  useEffect(() => {
    const onChange = () => { void reload(); };
    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, onChange);
  }, [reload]);

  if (tasks.length === 0) return null;
  const mineIds = new Set(myOpen.map((t) => t.id));
  const sentIds = new Set(sent.map((t) => t.id));
  const heading = tasks.every((t) => t.isNote) ? 'Notes para sa tao sa order na ito' : tasks.some((t) => t.isNote) ? 'Tasks & notes on this order' : 'Tasks on this order';

  return (
    <div className={openNotesOnly ? 'space-y-2' : 'space-y-2 px-6 pb-4'}>
      <p className="text-sm font-medium text-muted-foreground">{heading}</p>
      {tasks.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          view="owner"
          busy={staff.busyId === t.id}
          {...(mineIds.has(t.id) ? staff.handlers
            : sentIds.has(t.id) ? { onReply: sender.handlers.onRead, onCancel: sender.handlers.onCancel }
              : isManagement ? { onReply: owner.handlers.onReply } : {})}
        />
      ))}
      {staff.dialogs}
      {owner.dialogs}
      {sender.dialogs}
    </div>
  );
}
