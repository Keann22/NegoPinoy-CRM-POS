'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ClipboardCheck, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TASKS_CHANGED_EVENT, useAllTasks } from '@/hooks/useStaffTasks';
import { isLate, phtDateString } from '@/lib/services/staff-tasks/task-dates';
import { cn } from '@/lib/utils';
import { TASKS_PAGE_PATH } from './tasks-nav-badge';
import type { StaffTask } from '@/types/staff-tasks.types';

interface PersonRow { name: string; open: number; late: number; problem: number; doneToday: number }

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'orange' | 'blue' | 'green' }) {
  const color = value === 0 ? 'text-muted-foreground' : {
    red: 'text-red-700 dark:text-red-400',
    orange: 'text-orange-700 dark:text-orange-400',
    blue: 'text-blue-700 dark:text-blue-400',
    green: 'text-emerald-700 dark:text-emerald-400',
  }[tone || 'blue'] || '';
  return (
    <div className="rounded-lg border p-3">
      <div className={cn('text-2xl font-bold tabular-nums', tone ? color : '')}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/** Owners' dashboard: how the tasks given to staff stand, and what's waiting on the owners. */
export function OwnerTasksSummary() {
  const { tasks, reload } = useAllTasks(true);

  useEffect(() => {
    const onChange = () => { void reload().catch(() => undefined); };
    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    window.addEventListener('focus', onChange);
    return () => { window.removeEventListener(TASKS_CHANGED_EVENT, onChange); window.removeEventListener('focus', onChange); };
  }, [reload]);

  const s = useMemo(() => {
    const today = phtDateString();
    const open = tasks.filter((t) => t.status === 'open');
    const doneToday = tasks.filter((t) => t.status === 'done' && t.doneAt && phtDateString(new Date(t.doneAt)) === today);
    const needsYou: StaffTask[] = tasks
      .filter((t) => t.ownerUnread || (t.status === 'open' && t.progress === 'problem'))
      .slice(0, 5);
    const byPerson = new Map<string, PersonRow>();
    const row = (name: string) => byPerson.get(name) || { name, open: 0, late: 0, problem: 0, doneToday: 0 };
    open.forEach((t) => {
      const r = row(t.assigneeName);
      r.open += 1;
      if (isLate(t.dueAt)) r.late += 1;
      if (t.progress === 'problem') r.problem += 1;
      byPerson.set(t.assigneeName, r);
    });
    doneToday.forEach((t) => { const r = row(t.assigneeName); r.doneToday += 1; byPerson.set(t.assigneeName, r); });
    return {
      open: open.length,
      notSeen: open.filter((t) => !t.seenAt).length,
      working: open.filter((t) => t.progress === 'working').length,
      problem: open.filter((t) => t.progress === 'problem').length,
      late: open.filter((t) => isLate(t.dueAt)).length,
      replies: tasks.filter((t) => t.ownerUnread).length,
      doneToday: doneToday.length,
      needsYou,
      people: Array.from(byPerson.values()).sort((a, b) => b.late - a.late || b.open - a.open),
    };
  }, [tasks]);

  if (tasks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-blue-600" /> Tasks for staff</CardTitle>
          <CardDescription>What you assigned: open now, and what was done today.</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={TASKS_PAGE_PATH}>Open Tasks <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Open" value={s.open} />
          <Stat label="Not seen yet" value={s.notSeen} tone="orange" />
          <Stat label="Working on it" value={s.working} tone="blue" />
          <Stat label="Problem" value={s.problem} tone="orange" />
          <Stat label="Late" value={s.late} tone="red" />
          <Stat label="New replies" value={s.replies} tone="blue" />
          <Stat label="Done today" value={s.doneToday} tone="green" />
        </div>

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
                    <td className="py-1.5 text-right tabular-nums">{p.open}</td>
                    <td className={cn('py-1.5 text-right tabular-nums', p.late > 0 && 'font-semibold text-red-700 dark:text-red-400')}>{p.late}</td>
                    <td className={cn('py-1.5 text-right tabular-nums', p.problem > 0 && 'font-semibold text-orange-700 dark:text-orange-400')}>{p.problem}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.doneToday}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
