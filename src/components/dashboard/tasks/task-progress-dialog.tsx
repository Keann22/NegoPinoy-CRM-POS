'use client';

import { useState } from 'react';
import { AlertTriangle, Hammer } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { actOnTask } from '@/hooks/useStaffTasks';
import type { StaffTask, StaffTaskProgress } from '@/types/staff-tasks.types';

export interface ProgressTarget { task: StaffTask; progress: StaffTaskProgress }

const COPY: Record<StaffTaskProgress, { title: string; label: string; placeholder: string; save: string }> = {
  working: { title: 'Ginagawa na', label: 'Note (optional)', placeholder: 'e.g. Ipapadala mamayang hapon', save: 'Save' },
  problem: { title: 'May problema', label: 'Ano ang problema?', placeholder: 'e.g. Kulang ng 1 piece, wala sa shelf', save: 'Tell the owners' },
};

/** "Ginagawa na" (optional note) or "May problema" (reason required; the owner gets a bell). */
export function TaskProgressDialog({ target, onOpenChange }: {
  target: ProgressTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const copy = target ? COPY[target.progress] : COPY.working;
  const isProblem = target?.progress === 'problem';
  const canSave = !isProblem || note.trim().length > 0;

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
        <div className="space-y-1.5">
          <Label htmlFor="task-progress-note">{copy.label}</Label>
          <Textarea id="task-progress-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={copy.placeholder} />
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
