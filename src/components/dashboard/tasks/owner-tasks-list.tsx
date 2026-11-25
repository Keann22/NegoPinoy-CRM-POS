'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { actOnTask, TASKS_CHANGED_EVENT, useAllTasks } from '@/hooks/useStaffTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { phtDateString } from '@/lib/services/staff-tasks/task-dates';
import { cn } from '@/lib/utils';
import { AssignTaskDialog } from './assign-task-dialog';
import { countStats, inStat, TaskStatGrid, type StatKey } from './task-stat-cards';
import { TaskItem } from './task-item';
import type { StaffTask } from '@/types/staff-tasks.types';

type Filter = StatKey | 'done' | 'all';

const chip = (active: boolean) => cn(
  'rounded-full border px-3 py-1 text-sm',
  active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
);

/** Owners: every task given to staff, whether they saw it and whether it's done (last 14 days + all open). */
export function OwnerTasksList({ highlightId }: { highlightId: string | null }) {
  const { toast } = useToast();
  const { tasks, isLoading, reload } = useAllTasks(true);
  const [filter, setFilter] = useState<Filter>(highlightId ? 'all' : 'open');
  const [person, setPerson] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const thread = useTaskActions('owner');
  const openedHighlight = useRef(false);

  const people = useMemo(() => Array.from(new Set(tasks.map((t) => t.assigneeName))).sort(), [tasks]);
  const today = phtDateString();
  const baseTasks = useMemo(
    () => (person ? tasks.filter((t) => t.assigneeName === person) : tasks),
    [person, tasks]
  );
  const counts = useMemo(() => countStats(baseTasks, today), [baseTasks, today]);
  // Problems and unread replies first, then deadline (late ones on top).
  const needsOwner = (t: StaffTask) => Number(t.ownerUnread || (t.status === 'open' && t.progress === 'problem'));
  const shown = baseTasks
    .filter((t) => {
      if (filter === 'all') return true;
      if (filter === 'done') return t.status === 'done';
      return inStat(filter, t, today);
    })
    .sort((a, b) => (
      needsOwner(b) - needsOwner(a)
      || (a.dueAt || '9999').localeCompare(b.dueAt || '9999')
      || a.createdAt.localeCompare(b.createdAt)
    ));

  // Same task given to several people (one copy each): "2 of 3 done".
  const groups = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    tasks.forEach((t) => {
      if (!t.groupId || t.status === 'cancelled') return;
      const g = m.get(t.groupId) || { done: 0, total: 0 };
      g.total += 1;
      if (t.status === 'done') g.done += 1;
      m.set(t.groupId, g);
    });
    return m;
  }, [tasks]);

  useEffect(() => {
    const onChange = () => { void reload().catch(() => undefined); };
    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, onChange);
  }, [reload]);

  useEffect(() => {
    if (!highlightId || tasks.length === 0) return;
    document.getElementById(`task-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // From a "Task reply" bell: open the replies straight away.
    const t = tasks.find((x) => x.id === highlightId);
    if (t?.ownerUnread && !openedHighlight.current) {
      openedHighlight.current = true;
      thread.handlers.onReply(t);
    }
  }, [highlightId, tasks, thread.handlers]);

  const cancel = async (t: StaffTask) => {
    if (!window.confirm(`Cancel this task for ${t.assigneeName}?\n\n${t.message}`)) return;
    setBusyId(t.id);
    try {
      await actOnTask(t.id, 'cancel');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not cancelled', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>Tasks for staff</CardTitle>
          <CardDescription>
            What you assigned: tap a number or filter below to see those tasks.
          </CardDescription>
        </div>
        <Button onClick={() => setAssignOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New task</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <TaskStatGrid
          counts={counts}
          activeKey={filter === 'done' || filter === 'all' ? null : filter}
          onPick={(key) => setFilter(key)}
        />
        <div className="flex flex-wrap gap-2">
          {(['done', 'all'] as Filter[]).map((f) => (
            <button key={f} type="button" className={chip(filter === f)} onClick={() => setFilter(filter === f ? 'open' : f)}>
              {f === 'done' ? 'Done (14 days)' : 'All (14 days)'}
            </button>
          ))}
          {people.length > 1 && <span className="mx-1 border-l" />}
          {people.length > 1 && people.map((p) => (
            <button key={p} type="button" className={chip(person === p)} onClick={() => setPerson(person === p ? null : p)}>{p}</button>
          ))}
        </div>

        {isLoading && tasks.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && shown.length === 0 && <p className="text-sm text-muted-foreground">No tasks here.</p>}
        <div className="space-y-3">
          {shown.map((t) => (
            <div key={t.id} id={`task-${t.id}`} className={cn(highlightId === t.id && 'rounded-lg ring-2 ring-blue-500')}>
              <TaskItem
                task={t}
                view="owner"
                busy={busyId === t.id}
                onCancel={cancel}
                onReply={thread.handlers.onReply}
                onDone={thread.handlers.onDone}
                onHold={thread.handlers.onHold}
                onReschedule={thread.handlers.onReschedule}
                groupProgress={t.groupId ? groups.get(t.groupId) : null}
              />
            </div>
          ))}
        </div>
      </CardContent>
      {thread.dialogs}
      <AssignTaskDialog open={assignOpen} onOpenChange={setAssignOpen} onCreated={reload} />
    </Card>
  );
}
