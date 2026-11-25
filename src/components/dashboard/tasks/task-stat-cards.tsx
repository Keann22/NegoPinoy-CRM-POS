'use client';

import { isTaskLate, phtDateString } from '@/lib/services/staff-tasks/task-dates';
import { cn } from '@/lib/utils';
import type { StaffTask } from '@/types/staff-tasks.types';

export type StatKey = 'open' | 'notSeen' | 'working' | 'waiting' | 'problem' | 'late' | 'replies' | 'doneToday';

export const STAT_LABEL: Record<StatKey, string> = {
  open: 'Open',
  notSeen: 'Not seen yet',
  working: 'Working on it',
  waiting: 'Waiting for customer',
  problem: 'Problem',
  late: 'Late',
  replies: 'New replies',
  doneToday: 'Done today',
};

const STAT_TONE: Record<StatKey, 'red' | 'orange' | 'blue' | 'green' | undefined> = {
  open: undefined,
  notSeen: 'orange',
  working: 'blue',
  waiting: 'blue',
  problem: 'orange',
  late: 'red',
  replies: 'blue',
  doneToday: 'green',
};

const STAT_KEYS: StatKey[] = ['open', 'notSeen', 'working', 'waiting', 'problem', 'late', 'replies', 'doneToday'];

/** Which tasks each number counts. The numbers and the lists both use this, so they always agree. */
export function inStat(key: StatKey, t: StaffTask, today: string): boolean {
  const open = t.status === 'open';
  switch (key) {
    case 'open': return open;
    case 'notSeen': return open && !t.seenAt;
    case 'working': return open && t.progress === 'working';
    case 'waiting': return open && t.progress === 'waiting';
    case 'problem': return open && t.progress === 'problem';
    case 'late': return isTaskLate(t, today);
    case 'replies': return t.ownerUnread;
    case 'doneToday': return t.status === 'done' && !!t.doneAt && phtDateString(new Date(t.doneAt)) === today;
  }
}

export function countStats(tasks: StaffTask[], today: string = phtDateString()): Record<StatKey, number> {
  const counts = {} as Record<StatKey, number>;
  STAT_KEYS.forEach((k) => {
    counts[k] = tasks.filter((t) => inStat(k, t, today)).length;
  });
  return counts;
}

function StatTile({ label, value, tone, active, onClick }: {
  label: string;
  value: number;
  tone?: 'red' | 'orange' | 'blue' | 'green';
  active: boolean;
  onClick: () => void;
}) {
  const color = value === 0 ? 'text-muted-foreground' : {
    red: 'text-red-700 dark:text-red-400',
    orange: 'text-orange-700 dark:text-orange-400',
    blue: 'text-blue-700 dark:text-blue-400',
    green: 'text-emerald-700 dark:text-emerald-400',
  }[tone || 'blue'] || '';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={value === 0}
      aria-pressed={active}
      title={value === 0 ? undefined : 'Show these tasks'}
      className={cn(
        'rounded-lg border p-3 text-left transition-colors',
        value > 0 ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
        active && 'border-primary bg-muted ring-2 ring-primary'
      )}
    >
      <div className={cn('text-2xl font-bold tabular-nums', tone ? color : '')}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  );
}

/** Seven-tile task status bar shared by the Dashboard summary and the Tasks tab. */
export function TaskStatGrid({ counts, activeKey, onPick }: {
  counts: Record<StatKey, number>;
  activeKey: StatKey | null;
  onPick: (key: StatKey) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {STAT_KEYS.map((key) => (
        <StatTile
          key={key}
          label={STAT_LABEL[key]}
          value={counts[key]}
          tone={STAT_TONE[key]}
          active={activeKey === key}
          onClick={() => onPick(key)}
        />
      ))}
    </div>
  );
}
