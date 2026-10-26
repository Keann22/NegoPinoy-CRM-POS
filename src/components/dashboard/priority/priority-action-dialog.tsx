'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  BLOCK_REASONS, SEND_TODAY, phtDate, phtHour,
  type BlockReason, type PriorityRow,
} from '@/lib/priority/priority-rules';

export type PriorityAction = 'followup' | 'hold' | 'send_today' | 'block' | 'urgent';

interface Props {
  row: PriorityRow | null;
  action: PriorityAction | null;
  /** Admin / jas: may put a mark on today's list after the cutoff. */
  canOverride?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const COPY: Record<PriorityAction, { title: string; description: string; notePlaceholder: string; noteLabel: string; save: string }> = {
  followup: {
    title: 'Customer followed up',
    description: 'Log each time the customer chases this order on live or chat. Every follow-up moves the order up the list.',
    notePlaceholder: 'e.g. Asked again on live, wants it before Friday',
    noteLabel: 'Note',
    save: 'Log follow-up',
  },
  hold: {
    title: 'Customer asked to hold',
    description: 'The order leaves the list until this date, then comes back with its ranking.',
    notePlaceholder: 'e.g. Will combine with her next order',
    noteLabel: 'Why',
    save: 'Hold order',
  },
  send_today: {
    title: 'Send today',
    description: 'The warehouse gets reminders until it is booked for the 2 PM pickup.',
    notePlaceholder: 'e.g. Customer needs it before the weekend',
    noteLabel: 'Why today',
    save: 'Mark send today',
  },
  urgent: {
    title: 'Customer is in a hurry (nagmamadali)',
    description: 'Moves the order up the list and tells the owner/admins right away, with what is missing, so they can follow up or buy it.',
    notePlaceholder: 'e.g. Kailangan bago Nov 5, aalis ng bansa',
    noteLabel: 'What the customer said',
    save: 'Mark nagmamadali',
  },
  block: {
    title: "Can't send today",
    description: 'This goes back to the sales person with your reason.',
    notePlaceholder: 'Details (which item, what the customer said...)',
    noteLabel: 'Details',
    save: "Can't send today",
  },
};

export function PriorityActionDialog({ row, action, canOverride = false, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [holdUntil, setHoldUntil] = useState('');
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState<BlockReason | ''>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNote('');
    setHoldUntil('');
    setOverride(false);
    setReason('');
  }, [row?.id, action]);

  if (!row || !action) return null;
  const copy = COPY[action];
  const today = phtDate(new Date());
  const pastCutoff = phtHour(new Date()) >= SEND_TODAY.cutoffHour;
  const needsHoldDate = action === 'hold' || (action === 'block' && reason === 'customer_hold');
  const noteRequired = action !== 'block' || reason === 'other';

  const canSave =
    (!noteRequired || note.trim().length >= 2) &&
    (!needsHoldDate || holdUntil >= today) &&
    (action !== 'block' || reason !== '');

  const save = async () => {
    setIsSaving(true);
    try {
      const kind = action === 'block' ? 'send_today_blocked' : action;
      const res = await fetch('/api/priority/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: row.id, kind, note, holdUntil: needsHoldDate ? holdUntil : null, override, reason: reason || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      const title =
        action === 'followup' ? 'Follow-up logged'
        : action === 'hold' ? `On hold until ${holdUntil}`
        : action === 'block' ? 'Sent back to sales'
        : action === 'urgent' ? 'Marked nagmamadali — owner/admins notified'
        : data.sendDate === today ? 'On today\'s send list' : `On the send list for ${data.sendDate}`;
      toast({ title });
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
          {action === 'send_today' && pastCutoff && (
            <div className="rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              It&apos;s past {SEND_TODAY.cutoffHour} AM, so this goes on <b>tomorrow&apos;s</b> list.
              {canOverride && (
                <label className="mt-2 flex items-center gap-2">
                  <Checkbox checked={override} onCheckedChange={(v) => setOverride(v === true)} />
                  Send today anyway (I&apos;ll make sure the warehouse can make the 2 PM pickup)
                </label>
              )}
            </div>
          )}
          {action === 'block' && (
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as BlockReason)} className="gap-2">
              {(Object.keys(BLOCK_REASONS) as BlockReason[]).map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={r} />{BLOCK_REASONS[r]}
                </label>
              ))}
            </RadioGroup>
          )}
          {needsHoldDate && (
            <div className="space-y-1.5">
              <Label htmlFor="hold-until">Bring it back on</Label>
              <Input id="hold-until" type="date" min={today} value={holdUntil} onChange={(e) => setHoldUntil(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="priority-note">{copy.noteLabel}{noteRequired ? '' : ' (optional)'}</Label>
            <Textarea id="priority-note" rows={3} maxLength={500} placeholder={copy.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || isSaving} variant={action === 'block' ? 'destructive' : 'default'}>
            {isSaving ? 'Saving…' : copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
