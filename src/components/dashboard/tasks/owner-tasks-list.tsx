'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { actOnTask, TASKS_CHANGED_EVENT, useAllTasks } from '@/hooks/useStaffTasks';
import { isLate } from '@/lib/services/staff-tasks/task-dates';
import { cn } from '@/lib/utils';
import { AssignTaskDialog } from './assign-task-dialog';
import { TaskItem } from './task-item';
import type { StaffTask } from '@/types/staff-tasks.types';

type Filter = 'open' | 'done' | 'all';

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

  const people = useMemo(() => Array.from(new Set(tasks.map((t) => t.assigneeName))).sort(), [tasks]);
  const open = tasks.filter((t) => t.status === 'open');
  const problems = open.filter((t) => t.progress === 'problem').length;
  // Problems first: the staff member is waiting on the owners.
  const shown = tasks
    .filter((t) => (filter === 'all' || t.status === filter) && (!person || t.assigneeName === person))
    .sort((a, b) => Number(b.status === 'open' && b.progress === 'problem') - Number(a.status === 'open' && a.progress === 'problem'));

  useEffect(() => {
    const onChange = () => { void reload().catch(() => undefined); };
    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, onChange);
  }, [reload]);

  useEffect(() => {
    if (!highlightId || tasks.length === 0) return;
    document.getElementById(`task-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, tasks.length]);

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
            {open.length} open · {open.filter((t) => !t.seenAt).length} not seen yet · {open.filter((t) => t.progress === 'working').length} working on it · {open.filter((t) => isLate(t.dueAt)).length} late
            {problems > 0 && <span className="font-semibold text-orange-700 dark:text-orange-400"> · {problems} with a problem</span>}
          </CardDescription>
        </div>
        <Button onClick={() => setAssignOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New task</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(['open', 'done', 'all'] as Filter[]).map((f) => (
            <button key={f} type="button" className={chip(filter === f)} onClick={() => setFilter(f)}>
              {f === 'open' ? 'Open' : f === 'done' ? 'Done' : 'All (14 days)'}
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
              <TaskItem task={t} view="owner" busy={busyId === t.id} onCancel={cancel} />
            </div>
          ))}
        </div>
      </CardContent>
      <AssignTaskDialog open={assignOpen} onOpenChange={setAssignOpen} onCreated={reload} />
    </Card>
  );
}
