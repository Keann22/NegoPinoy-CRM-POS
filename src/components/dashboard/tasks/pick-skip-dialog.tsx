'use client';

import { useState } from 'react';
import { PauseCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { skipPick } from '@/hooks/usePickSkips';
import { cn } from '@/lib/utils';
import { PICK_SKIP_REASONS, type PickSkipReason } from '@/types/pick-skips.types';

const REASONS: PickSkipReason[] = ['later', 'other'];
const chip = (active: boolean) => cn(
  'rounded-full border px-3 py-1.5 text-sm transition-colors',
  active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
);

interface Props {
  order: { id: string; orderNo: string; customerName: string; salesPersonName: string | null } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * "Hindi pa ipi-pick" (owner, 2026-11-25): the shelf covers the order but the
 * warehouse isn't picking it yet. Say why; the sales agent gets a pop-up to set
 * the ship date or say pick it now. Wrong or missing items go through the Picker (OS).
 */
export function PickSkipDialog({ order, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState<PickSkipReason | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const canSave = !!reason && (reason !== 'other' || note.trim().length > 0);

  const close = (open: boolean) => {
    if (!open) { setReason(null); setNote(''); }
    onOpenChange(open);
  };

  const save = async () => {
    if (!order || !reason || !canSave) return;
    setSaving(true);
    try {
      await skipPick(order.id, reason, note);
      toast({ title: 'Tinanong ang sales', description: `${order.salesPersonName || 'The owners'} will set the ship date or say pick it now.` });
      onSaved();
      close(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PauseCircle className="h-5 w-5" /> Hindi pa ipi-pick</DialogTitle>
          <DialogDescription>
            {order ? `#${order.orderNo} · ${order.customerName}` : ''}. Sales will be asked to set the ship date or say pick it now.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bakit?</Label>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button key={r} type="button" aria-pressed={reason === r} className={chip(reason === r)} onClick={() => setReason(r)} title={PICK_SKIP_REASONS[r].hint}>
                  {PICK_SKIP_REASONS[r].label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pick-skip-note">Note {reason === 'other' ? '' : <span className="font-normal text-muted-foreground">(optional)</span>}</Label>
            <Textarea id="pick-skip-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. sabi sa order form: reserve for December" />
          </div>
          <p className="text-xs text-muted-foreground">Item missing or wrong on the shelf? Use Pick Now and mark it OS instead.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : 'Ask sales'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
