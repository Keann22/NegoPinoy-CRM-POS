'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { phtDate, type PriorityRow } from '@/lib/priority/priority-rules';

export type PriorityAction = 'followup' | 'hold';

interface Props {
  row: PriorityRow | null;
  action: PriorityAction | null;
  onClose: () => void;
  onSaved: () => void;
}

const COPY: Record<PriorityAction, { title: string; description: string; notePlaceholder: string; save: string }> = {
  followup: {
    title: 'Customer followed up',
    description: 'Log each time the customer chases this order on live or chat. Every follow-up moves the order up the list.',
    notePlaceholder: 'e.g. Asked again on live, wants it before Friday',
    save: 'Log follow-up',
  },
  hold: {
    title: 'Customer asked to hold',
    description: 'The order leaves the list until this date, then comes back with its ranking.',
    notePlaceholder: 'e.g. Will combine with her next order',
    save: 'Hold order',
  },
};

export function PriorityActionDialog({ row, action, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [holdUntil, setHoldUntil] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNote('');
    setHoldUntil('');
  }, [row?.id, action]);

  if (!row || !action) return null;
  const copy = COPY[action];
  const today = phtDate(new Date());
  const canSave = note.trim().length >= 2 && (action === 'followup' || holdUntil >= today);

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/priority/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: row.id, kind: action, note, holdUntil: action === 'hold' ? holdUntil : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast({ title: action === 'followup' ? 'Follow-up logged' : `On hold until ${holdUntil}` });
      onSaved();
      onClose();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            #{row.id.slice(0, 7).toUpperCase()} · {row.customerName || 'Customer'} — {copy.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {action === 'hold' && (
            <div className="space-y-1.5">
              <Label htmlFor="hold-until">Bring it back on</Label>
              <Input id="hold-until" type="date" min={today} value={holdUntil} onChange={(e) => setHoldUntil(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="priority-note">{action === 'hold' ? 'Why' : 'Note'}</Label>
            <Textarea id="priority-note" rows={3} maxLength={500} placeholder={copy.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || isSaving}>{isSaving ? 'Saving…' : copy.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
