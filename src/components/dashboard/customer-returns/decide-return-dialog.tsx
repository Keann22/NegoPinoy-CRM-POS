'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CR_OUTCOME_LABELS,
  CR_OUTCOME_TODO,
  type CustomerReturn,
  type CustomerReturnAction,
  type CustomerReturnOutcome,
} from '@/types/customer-returns.types';

interface Props {
  ret: CustomerReturn | null;
  onClose: () => void;
  onSubmit: (action: CustomerReturnAction) => Promise<void>;
}

/** Which outcomes make sense for where the case came from. */
function outcomesFor(ret: CustomerReturn): CustomerReturnOutcome[] {
  if (ret.source === 'rts') return ['reship', 'cancel_order', 'replacement', 'full_refund', 'store_credit', 'no_action'];
  return ['replacement', 'partial_refund', 'full_refund', 'store_credit', 'no_action'];
}

const AMOUNT_OUTCOMES: CustomerReturnOutcome[] = ['full_refund', 'partial_refund', 'store_credit'];

/** Owners: what the customer gets, and whether the item has to come back. */
export function DecideReturnDialog({ ret, onClose, onSubmit }: Props) {
  const [outcome, setOutcome] = useState<CustomerReturnOutcome | null>(null);
  const [askBack, setAskBack] = useState(false);
  const [timing, setTiming] = useState<'now' | 'after_arrival'>('now');
  const [amount, setAmount] = useState('');
  const [courierClaim, setCourierClaim] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ret) return;
    setOutcome(ret.outcome);
    setAskBack(ret.source === 'damage_report' ? ret.askBack : true);
    setTiming(ret.replacementTiming || 'now');
    setAmount(ret.amount ? String(ret.amount) : '');
    setCourierClaim(ret.courierClaim);
    setNote(ret.decisionNote || '');
    setError(null);
  }, [ret]);

  if (!ret) return null;
  const comesBackAnyway = ret.source !== 'damage_report';
  const keepsIt = outcome === 'partial_refund';
  const effectiveAskBack = comesBackAnyway || (!keepsIt && askBack);
  const showTiming = effectiveAskBack && !!outcome && outcome !== 'reship' && !!CR_OUTCOME_TODO[outcome] && !(comesBackAnyway && ret.checkedAt);

  const submit = async () => {
    if (!outcome) return setError('Pick what the customer gets.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        action: 'decide', id: ret.id, outcome, askBack: effectiveAskBack,
        replacementTiming: showTiming ? timing : undefined,
        amount: AMOUNT_OUTCOMES.includes(outcome) ? Number(amount) || 0 : 0,
        courierClaim, note,
      });
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
          <DialogTitle>Return #{ret.caseNo}: decide</DialogTitle>
          <DialogDescription>
            {ret.customerName} · {ret.reason}. {ret.items.map((i) => `${i.qty}× ${i.productName}`).join(', ')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What does the customer get?</Label>
            <div className="grid gap-1.5">
              {outcomesFor(ret).map((o) => (
                <Button key={o} type="button" variant={outcome === o ? 'default' : 'outline'} className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => setOutcome(o)}>
                  {CR_OUTCOME_LABELS[o]}
                </Button>
              ))}
            </div>
          </div>

          {outcome && AMOUNT_OUTCOMES.includes(outcome) && (
            <div className="space-y-1.5">
              <Label htmlFor="dr-amount">Amount (₱){outcome === 'full_refund' ? ' (optional)' : ''}</Label>
              <Input id="dr-amount" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          )}

          {comesBackAnyway ? (
            <p className="text-xs text-muted-foreground">
              {ret.checkedAt ? 'The parcel is back and checked.' : 'The item is coming back; staff will check every piece when it arrives.'}
            </p>
          ) : keepsIt ? (
            <p className="text-xs text-muted-foreground">The customer keeps the item, so nothing comes back.</p>
          ) : (
            <div className="space-y-1.5">
              <Label>Ask for the item back?</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Button type="button" variant={!askBack ? 'default' : 'outline'} onClick={() => setAskBack(false)}>No, they keep it</Button>
                <Button type="button" variant={askBack ? 'default' : 'outline'} onClick={() => setAskBack(true)}>Yes, ship it back</Button>
              </div>
            </div>
          )}

          {showTiming && (
            <div className="space-y-1.5">
              <Label>When?</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Button type="button" variant={timing === 'now' ? 'default' : 'outline'} onClick={() => setTiming('now')}>Now</Button>
                <Button type="button" variant={timing === 'after_arrival' ? 'default' : 'outline'} onClick={() => setTiming('after_arrival')}>After it arrives</Button>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={courierClaim} onCheckedChange={(v) => setCourierClaim(v === true)} />
            Claim from the courier
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="dr-note">Note for staff / the agent (optional)</Label>
            <Textarea id="dr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !outcome}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
