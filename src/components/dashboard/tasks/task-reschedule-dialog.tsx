'use client';

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { actOnTask } from '@/hooks/useStaffTasks';
import { dueFromPick, dueLabel, phtDateString, type DuePick } from '@/lib/services/staff-tasks/task-dates';
import { cn } from '@/lib/utils';
import type { StaffTask } from '@/types/staff-tasks.types';

const PICKS: { value: Exclude<DuePick, 'hour'>; label: string }[] = [
  { value: 'today', label: 'Today (6 PM)' },
  { value: 'tomorrow', label: 'Tomorrow (6 PM)' },
  { value: 'threeDays', label: 'In 3 days (6 PM)' },
  { value: 'date', label: 'Pick a date' },
  { value: 'none', label: 'No deadline' },
];

const chip = (active: boolean) => cn(
  'rounded-full border px-3 py-1.5 text-sm transition-colors',
  active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
);

/** Owners move or clear a task's deadline (e.g. waiting on a customer reply). */
export function TaskRescheduleDialog({ task, onOpenChange, onSaved }: {
  task: StaffTask | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [pick, setPick] = useState<Exclude<DuePick, 'hour'>>('tomorrow');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = pick !== 'date' || !!date;

  const close = (next: boolean) => {
    if (!next) { setPick('tomorrow'); setDate(''); }
    onOpenChange(next);
  };

  const save = async () => {
    if (!task || !canSave) return;
    setSaving(true);
    try {
      await actOnTask(task.id, 'reschedule', { dueAt: dueFromPick(pick, date) });
      toast({ title: 'Deadline updated', description: pick === 'none' ? 'Deadline removed.' : 'New deadline saved.' });
      onSaved?.();
      close(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-blue-600" /> Move deadline</DialogTitle>
          <DialogDescription className="text-base text-foreground">{task?.message}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {task?.dueAt && (
            <p className="text-xs text-muted-foreground">Current deadline: {dueLabel(task.dueAt).text}</p>
          )}
          <div className="space-y-2">
            <Label>New deadline</Label>
            <div className="flex flex-wrap gap-2">
              {PICKS.map((p) => (
                <button key={p.value} type="button" aria-pressed={pick === p.value} className={chip(pick === p.value)} onClick={() => setPick(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
            {pick === 'date' && (
              <Input type="date" min={phtDateString()} value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>Back</Button>
          <Button onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : 'Save deadline'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
