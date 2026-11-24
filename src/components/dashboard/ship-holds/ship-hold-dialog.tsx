'use client';

import { useState } from 'react';
import { Bus, PauseCircle, Truck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { saveShipHold, useShipHoldForm } from '@/hooks/useShipHolds';
import { DEFAULT_CHECK_DAYS, addDaysPht, paidEnough, shortPhtDate } from '@/lib/shipping/ship-hold-rules';
import { cn } from '@/lib/utils';
import {
  SHIP_HOLD_KINDS, SHIP_HOLD_KIND_ORDER, type ShipHoldFormData, type ShipHoldKind, type ShipVia,
} from '@/types/ship-holds.types';

const peso = (n: number) => {
  const cents = Math.round(n * 100) % 100 !== 0;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const chip = (active: boolean) => cn(
  'rounded-full border px-3 py-1.5 text-sm transition-colors',
  active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
);

interface Props {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * "Not for shipping yet" (owner, 2026-11-24, phase 2): why it waits, when sales
 * is asked again, and which of the customer's orders ship with it. Replaces the
 * free-text Delay box on Packed Orders.
 */
export function ShipHoldDialog({ orderId, open, onOpenChange, onSaved }: Props) {
  const { form, error, loading } = useShipHoldForm(open ? orderId : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PauseCircle className="h-5 w-5" /> Hindi pa ipapadala</DialogTitle>
          <DialogDescription>
            {form ? `${form.shortId} · ${form.customerName} · ${form.status}` : 'Why this order waits, and when to ask again.'}
          </DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Loading the order…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {form && <HoldForm key={form.orderId} form={form} onCancel={() => onOpenChange(false)} onSaved={() => { onSaved?.(); onOpenChange(false); }} />}
      </DialogContent>
    </Dialog>
  );
}

function HoldForm({ form, onCancel, onSaved }: { form: ShipHoldFormData; onCancel: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const h = form.hold;
  const busHint = /bus/i.test(form.holdText || '');
  const [kind, setKind] = useState<ShipHoldKind | null>(h?.kind || null);
  const [note, setNote] = useState(h?.note || (!h && form.holdText ? form.holdText : ''));
  const [checkOn, setCheckOn] = useState(h?.checkOn || addDaysPht(DEFAULT_CHECK_DAYS));
  const [shipVia, setShipVia] = useState<ShipVia>(h?.shipVia || (busHint ? 'bus' : 'courier'));
  const [withIds, setWithIds] = useState<string[]>(
    h?.groupId ? h.orders.map((o) => o.id).filter((id) => id !== form.orderId) : form.others.map((o) => o.id),
  );
  const [saving, setSaving] = useState(false);

  const pickKind = (k: ShipHoldKind) => {
    setKind(k);
    if (k === 'date' && !h) setCheckOn('');
    else if (!checkOn) setCheckOn(addDaysPht(DEFAULT_CHECK_DAYS));
  };

  const tomorrow = addDaysPht(1);
  const needsOrders = kind === 'with_orders' && withIds.length === 0;
  const canSave = !!kind && !!checkOn && checkOn >= tomorrow && !needsOrders && (kind !== 'other' || note.trim().length > 0);
  const unpaidByBus = kind === 'with_orders' && shipVia === 'bus'
    ? form.others.filter((o) => withIds.includes(o.id) && !paidEnough(o, 'bus'))
    : [];

  const save = async () => {
    if (!canSave || !kind) return;
    setSaving(true);
    try {
      await saveShipHold({ orderId: form.orderId, kind, note, checkOn, shipVia, withOrderIds: kind === 'with_orders' ? withIds : [] });
      toast({ title: 'Naka-hold', description: `We'll ask again on ${shortPhtDate(checkOn)}${kind === 'with_orders' ? ', or as soon as every order is packed and paid' : kind === 'payment' ? ', or as soon as it is paid' : ''}.` });
      onSaved();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not saved', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {!h && form.holdText && (
          <p className="rounded-md bg-muted px-2 py-1.5 text-xs">Written before: &ldquo;{form.holdText}&rdquo;</p>
        )}

        <div className="space-y-2">
          <Label>Bakit hindi pa?</Label>
          <div className="flex flex-wrap gap-2">
            {SHIP_HOLD_KIND_ORDER.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} className={chip(kind === k)} onClick={() => pickKind(k)} title={SHIP_HOLD_KINDS[k].hint}>
                {SHIP_HOLD_KINDS[k].label}
              </button>
            ))}
          </div>
        </div>

        {kind === 'with_orders' && (
          <div className="space-y-2">
            <Label>Kasama ang mga order na ito</Label>
            {form.others.length === 0 && <p className="text-sm text-muted-foreground">This customer has no other open orders.</p>}
            <ul className="space-y-1">
              {form.others.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <Checkbox
                      checked={withIds.includes(o.id)}
                      onCheckedChange={(v) => setWithIds((ids) => (v ? [...ids, o.id] : ids.filter((x) => x !== o.id)))}
                    />
                    <span className="font-mono font-semibold">{o.shortId}</span>
                    <span className="text-muted-foreground">{o.status}</span>
                    <span className={cn('ml-auto text-xs', o.balanceDue >= 1 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-400')}>
                      {o.balanceDue >= 1 ? `${peso(o.balanceDue)} balance${o.paymentMethod === 'COD' ? ' (COD)' : ''}` : 'paid'}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <Label className="pt-1">Paano ipapadala?</Label>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={shipVia === 'courier'} className={chip(shipVia === 'courier')} onClick={() => setShipVia('courier')}>
                <Truck className="mr-1 inline h-4 w-4" />Courier (SPX)
              </button>
              <button type="button" aria-pressed={shipVia === 'bus'} className={chip(shipVia === 'bus')} onClick={() => setShipVia('bus')}>
                <Bus className="mr-1 inline h-4 w-4" />Bus
              </button>
            </div>
            {unpaidByBus.length > 0 && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                The bus doesn&apos;t collect COD: {unpaidByBus.map((o) => `${o.shortId} (${peso(o.balanceDue)})`).join(', ')} must be paid before they go.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="hold-note">Note {kind === 'other' ? '' : <span className="font-normal text-muted-foreground">(optional)</span>}</Label>
          <Textarea id="hold-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. sabay sa sahod niya, Nov 30 daw" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hold-check">{kind === 'date' ? 'Ipadala sa' : 'Tanungin ulit sa'}</Label>
          <Input id="hold-check" type="date" min={tomorrow} value={checkOn} onChange={(e) => setCheckOn(e.target.value)} className="w-48" />
          {checkOn && checkOn < tomorrow && <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Pick a date after today.</p>}
          <p className="text-xs text-muted-foreground">
            The sales agent gets a pop-up that day (&ldquo;Ready na ba?&rdquo;). Owners see it if there&apos;s no answer after 3 days.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : h ? 'Save changes' : 'Hold it'}</Button>
      </DialogFooter>
    </>
  );
}
