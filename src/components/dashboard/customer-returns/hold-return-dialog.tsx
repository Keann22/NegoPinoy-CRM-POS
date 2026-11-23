'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CustomerReturn, CustomerReturnAction } from '@/types/customer-returns.types';

interface Props {
  ret: CustomerReturn | null;
  onClose: () => void;
  onSubmit: (action: CustomerReturnAction) => Promise<void>;
}

const DAY_MS = 24 * 3600 * 1000;
const phYmd = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

/** Puts a customer return case on hold until a PH calendar date. */
export function HoldReturnDialog({ ret, onClose, onSubmit }: Props) {
  const [holdUntil, setHoldUntil] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tomorrow = phYmd(Date.now() + DAY_MS);

  useEffect(() => {
    if (!ret) return;
    setHoldUntil(ret.holdUntil && ret.holdUntil >= tomorrow ? ret.holdUntil : phYmd(Date.now() + 7 * DAY_MS));
    setNote(ret.holdNote || '');
    setError(null);
  }, [ret, tomorrow]);

  if (!ret) return null;

  const setOffset = (days: number) => setHoldUntil(phYmd(Date.now() + days * DAY_MS));

  const submit = async () => {
    if (!holdUntil || holdUntil < tomorrow) return setError('Pick tomorrow or a later date.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ action: 'hold', id: ret.id, holdUntil, note });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!ret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Return #{ret.caseNo}: hold until date</DialogTitle>
          <DialogDescription>
            {ret.customerName}. Moves this case to <strong>On hold</strong>. On the chosen date, it automatically returns to <strong>To do</strong> and sends a bell reminder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hold-date">Hold until</Label>
            <Input
              id="hold-date"
              type="date"
              min={tomorrow}
              value={holdUntil}
              onChange={(e) => setHoldUntil(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOffset(3)}>+3 days</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOffset(7)}>+1 week</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOffset(14)}>+2 weeks</Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hold-note">Reason / note (optional)</Label>
            <Textarea
              id="hold-note"
              rows={2}
              placeholder="e.g. Customer asked to re-ship on Dec 3"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Put on hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
