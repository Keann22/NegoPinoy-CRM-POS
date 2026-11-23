'use client';

import { useState } from 'react';
import { Camera, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { actOnTask, uploadTaskPhoto } from '@/hooks/useStaffTasks';
import type { StaffTask } from '@/types/staff-tasks.types';

/** Done, with an optional note and photo. The owner who gave the task gets a bell. */
export function TaskDoneDialog({ task, onOpenChange, onDone }: {
  task: StaffTask | null;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const close = (next: boolean) => {
    if (!next) { setNote(''); setPhoto(null); }
    onOpenChange(next);
  };

  const save = async () => {
    if (!task) return;
    setSaving(true);
    try {
      const photoUrl = photo ? await uploadTaskPhoto(photo) : null;
      await actOnTask(task.id, 'done', { note: note.trim(), photoUrl });
      toast({ title: 'Done', description: `${task.assignedByName} will see it's done.` });
      onDone?.();
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
          <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Tapos na?</DialogTitle>
          <DialogDescription className="text-base text-foreground">{task?.message}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-done-note">Note (optional)</Label>
            <Textarea id="task-done-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Naipadala na, SPX" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-done-photo" className="flex items-center gap-1.5"><Camera className="h-4 w-4" /> Photo (optional)</Label>
            <input
              id="task-done-photo"
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Back</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving…' : 'Done'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
