'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ClipboardCheck, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { actOnTask, TASKS_CHANGED_EVENT, useAllTasks } from '@/hooks/useStaffTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { isTaskLate, phtDateString } from '@/lib/services/staff-tasks/task-dates';
import { cn } from '@/lib/utils';
import { countStats, inStat, STAT_LABEL, TaskStatGrid, type StatKey } from './task-stat-cards';
import { TaskItem } from './task-item';
import { UnseenNotesAlert } from './unseen-notes-list';
import { TASKS_PAGE_PATH } from './tasks-nav-badge';
import type { StaffTask } from '@/types/staff-tasks.types';

interface PersonRow { name: string; open: number; late: number; problem: number; doneToday: number }

const PICKED_LIST_ID = 'owner-tasks-picked';

/** A number in the per-staff table: tap to list that person's tasks. */
function PersonCount({ value, className, onClick }: { value: number; className?: string; onClick: () => void }) {
  if (value === 0) return <span className={cn('tabular-nums', className)}>0</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('tabular-nums underline decoration-dotted underline-offset-4 hover:text-primary', className)}
    >
      {value}
    </button>
  );
}

/** Owners' dashboard: how the tasks given to staff stand, and what's waiting on the owners. */
export function OwnerTasksSummary() {
  const { toast } = useToast();
  const { tasks, reload } = useAllTasks(true);
  const thread = useTaskActions('owner');
  // Tapped number: list the tasks it counts (all staff, or one person from the table).
  const [picked, setPicked] = useState<{ key: StatKey; person: string | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => { void reload().catch(() => undefined); };
    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    window.addEventListener('focus', onChange);
    return () => { window.removeEventListener(TASKS_CHANGED_EVENT, onChange); window.removeEventListener('focus', onChange); };
  }, [reload]);

  const s = useMemo(() => {
    const today = phtDateString();
    const open = tasks.filter((t) => t.status === 'open');
    const doneToday = tasks.filter((t) => inStat('doneToday', t, today));
    const needsYou: StaffTask[] = tasks
      .filter((t) => t.ownerUnread || (t.status === 'open' && t.progress === 'problem'))
      .slice(0, 5);
    const byPerson = new Map<string, PersonRow>();
    const row = (name: string) => byPerson.get(name) || { name, open: 0, late: 0, problem: 0, doneToday: 0 };
    open.forEach((t) => {
      const r = row(t.assigneeName);
      r.open += 1;
      if (isTaskLate(t, today)) r.late += 1;
      if (t.progress === 'problem') r.problem += 1;
      byPerson.set(t.assigneeName, r);
    });
    doneToday.forEach((t) => { const r = row(t.assigneeName); r.doneToday += 1; byPerson.set(t.assigneeName, r); });
    return {
      counts: countStats(tasks, today),
      needsYou,
      people: Array.from(byPerson.values()).sort((a, b) => b.late - a.late || b.open - a.open),
    };
  }, [tasks]);

  const pickedTasks = useMemo(() => {
    if (!picked) return [];
    const today = phtDateString();
    // Deadline first (late ones on top), then oldest.
    return tasks
      .filter((t) => inStat(picked.key, t, today) && (!picked.person || t.assigneeName === picked.person))
      .sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || a.createdAt.localeCompare(b.createdAt));
  }, [picked, tasks]);

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

  const pick = (key: StatKey, person: string | null = null) => {
    const same = picked?.key === key && picked.person === person;
    setPicked(same ? null : { key, person });
    if (!same) setTimeout(() => document.getElementById(PICKED_LIST_ID)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

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

  if (tasks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-blue-600" /> Tasks for staff</CardTitle>
          <CardDescription>What you assigned: open now, and what was done today. Tap a number to see those tasks.</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={TASKS_PAGE_PATH}>Open Tasks <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <UnseenNotesAlert />
        <TaskStatGrid
          counts={s.counts}
          activeKey={picked && !picked.person ? picked.key : null}
          onPick={(key) => pick(key)}
        />

        {picked && (
          <div id={PICKED_LIST_ID} className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {STAT_LABEL[picked.key]}{picked.person ? ` · ${picked.person}` : ''} ({pickedTasks.length})
              </p>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setPicked(null)}>
                <X className="mr-1 h-4 w-4" />Close
              </Button>
            </div>
            {pickedTasks.length === 0 && <p className="text-sm text-muted-foreground">None right now.</p>}
            <div className="max-h-[32rem] space-y-2 overflow-y-auto">
              {pickedTasks.map((t) => (
                <TaskItem
                  key={t.id}
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
              ))}
            </div>
          </div>
        )}

        {s.needsYou.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Waiting on you</p>
            {s.needsYou.map((t) => (
              <Link
                key={t.id}
                href={`${TASKS_PAGE_PATH}?task=${t.id}`}
                className="flex items-start gap-2 rounded-md border p-2 text-sm hover:bg-muted"
              >
                {t.ownerUnread
                  ? <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />}
                <span className="min-w-0">
                  <span className="font-medium">{t.assigneeName}</span>
                  <span className="text-muted-foreground"> · {t.ownerUnread ? 'replied' : 'has a problem'}{t.orderShortId ? ` · ${t.orderShortId}` : ''}</span>
                  <span className="block truncate">{t.ownerUnread ? t.message : t.progressNote || t.message}</span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {s.people.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Staff</th>
                  <th className="py-1 text-right font-medium">Open</th>
                  <th className="py-1 text-right font-medium">Late</th>
                  <th className="py-1 text-right font-medium">Problem</th>
                  <th className="py-1 text-right font-medium">Done today</th>
                </tr>
              </thead>
              <tbody>
                {s.people.map((p) => (
                  <tr key={p.name} className="border-t">
                    <td className="py-1.5">{p.name}</td>
                    <td className="py-1.5 text-right"><PersonCount value={p.open} onClick={() => pick('open', p.name)} /></td>
                    <td className="py-1.5 text-right">
                      <PersonCount value={p.late} className={p.late > 0 ? 'font-semibold text-red-700 dark:text-red-400' : ''} onClick={() => pick('late', p.name)} />
                    </td>
                    <td className="py-1.5 text-right">
                      <PersonCount value={p.problem} className={p.problem > 0 ? 'font-semibold text-orange-700 dark:text-orange-400' : ''} onClick={() => pick('problem', p.name)} />
                    </td>
                    <td className="py-1.5 text-right"><PersonCount value={p.doneToday} onClick={() => pick('doneToday', p.name)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {thread.dialogs}
    </Card>
  );
}
