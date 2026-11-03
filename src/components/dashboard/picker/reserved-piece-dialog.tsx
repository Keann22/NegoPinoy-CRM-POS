'use client';

import { useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { ShelfPrompt } from '@/hooks/picker/useShelfGuard';

type ReservedPrompt = Extract<ShelfPrompt, { kind: 'reserved' }>;

interface Props {
  prompt: ReservedPrompt;
  onLeave: () => void;
  onOverride: (reason: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Found was tapped, but the pieces on the shelf are reserved for another
 * order's replacement (owner rule 2026-11-03). The picker leaves them (OS);
 * an owner can give them to this order with a reason.
 */
export function ReservedPieceDialog({ prompt, onLeave, onOverride, onClose }: Props) {
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const isOwner = (userProfile?.roles || []).some((r) => ['owner', 'admin'].includes(String(r).toLowerCase()));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setReason(''); setSaving(false); }, [prompt]);

  const override = async () => {
    setSaving(true);
    try {
      await onOverride(reason.trim());
      toast({ title: 'Given to this order', description: 'The replacement still waits for its piece; whoever reserved it was told.' });
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-violet-600" />Reserved for a replacement</DialogTitle>
          <DialogDescription>
            {prompt.productName}: {prompt.free > 0
              ? `only ${prompt.free} of the pieces on the shelf ${prompt.free === 1 ? 'is' : 'are'} free; the rest`
              : 'the pieces on the shelf'} are saved for:
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5">
          {prompt.orders.map((o) => (
            <li key={o.orderId} className="rounded-md border border-violet-200 bg-violet-50 p-2 text-sm dark:border-violet-900 dark:bg-violet-950">
              <span className="font-semibold">#{o.shortId} · {o.customerName}</span> · {o.qty} pc{o.qty === 1 ? '' : 's'}
              {o.note && <div className="text-xs text-muted-foreground">“{o.note}”{o.byName ? ` — ${o.byName}` : ''}</div>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Pick those orders first. This order waits for the next delivery.</p>

        <div className="space-y-2">
          <Button className="w-full" disabled={saving}
            onClick={() => { onLeave(); toast({ title: 'Marked OS', description: 'Left for the replacement. This order waits for more stock.' }); }}>
            Leave it for them → mark OS
          </Button>
          {isOwner && (
            <div className="space-y-2 rounded-md border p-3">
              <Label htmlFor="rp-reason" className="font-semibold">Owner: give it to this order instead</Label>
              <Textarea id="rp-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why (e.g. customer picking up today; replacement can wait)" />
              <Button variant="outline" className="w-full" disabled={saving || reason.trim().length < 3} onClick={override}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Give it to this order
              </Button>
            </div>
          )}
          <Button variant="ghost" className="w-full" disabled={saving} onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
