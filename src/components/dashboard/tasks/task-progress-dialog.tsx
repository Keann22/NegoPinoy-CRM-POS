'use client';

import { useState } from 'react';
import { AlertTriangle, Hammer } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { actOnTask } from '@/hooks/useStaffTasks';
import { isLate } from '@/lib/services/staff-tasks/task-dates';
import type { StaffTask, StaffTaskProgress } from '@/types/staff-tasks.types';

export interface ProgressTarget { task: StaffTask; progress: StaffTaskProgress }

const WORKING_QUICK_NOTES = [
  'Asked customer, waiting for reply',
  'Will ship later today',
  'Checking with warehouse',
];

const COPY: Record<StaffTaskProgress, { title: string; label: string; placeholder: string; save: string }> = {
  working: { title: 'Working on it', label: 'Update note', placeholder: 'e.g. Waiting for customer reply today', save: 'Save update' },
  problem: { title: 'Problem', label: "What's the problem?", placeholder: 'e.g. 1 piece short, not on the shelf', save: 'Tell the owners' },
};

/** "Working on it" (update note; required if past deadline) or "Problem" (reason required; owner gets a bell). */
export function TaskProgressDialog({ target, onOpenChange }: {
  target: ProgressTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const copy = target ? COPY[target.progress] : COPY.working;
  const isProblem = target?.progress === 'problem';
  const lateWorking = target?.progress === 'working' && isLate(target.task.dueAt);
  const needsNote = isProblem || lateWorking;
  const canSave = !needsNote || note.trim().length > 0;

  const close = (next: boolean) => {
    if (!next) setNote('');
    onOpenChange(next);
  };

  const save = async () => {
    if (!target || !canSave) return;
    setSaving(true);
    try {
      await actOnTask(target.task.id, target.progress, { note: note.trim() });
      toast({
        title: isProblem ? 'Owners told' : 'Saved',
        description: isProblem ? (target.task.auto ? 'The owners will see the problem.' : `${target.task.assignedByName} will see the problem.`) : 'The owners can see you are working on it.',
      });
      close(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={isProblem ? 'flex items-center gap-2 text-orange-700 dark:text-orange-400' : 'flex items-center gap-2'}>
            {isProblem ? <AlertTriangle className="h-5 w-5" /> : <Hammer className="h-5 w-5 text-sky-600" />} {copy.title}
          </DialogTitle>
          <DialogDescription className="text-base text-foreground">{target?.task.message}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {target?.progress === 'working' && target.task.progressNote && (
            <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
              Previous update: &ldquo;{target.task.progressNote}&rdquo;
            </p>
          )}
          {target?.progress === 'working' && (
            <div className="flex flex-wrap gap-1.5">
              {WORKING_QUICK_NOTES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setNote(q)}
                  className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="task-progress-note">
              {isProblem ? copy.label : lateWorking ? 'Update (required since past deadline)' : 'Note (optional)'}
            </Label>
            <Textarea id="task-progress-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={copy.placeholder} />
          </div>
          {lateWorking && (
            <p className="text-xs text-muted-foreground">
              Saving an update pauses the late pop-up until tomorrow (the owners will still see your update).
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Back</Button>
          <Button onClick={save} disabled={!canSave || saving} className={isProblem ? 'bg-orange-600 hover:bg-orange-700' : undefined}>
            {saving ? 'Saving…' : copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
