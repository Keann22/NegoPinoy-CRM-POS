'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { fetchReturnableLines, openCustomerReturn } from '@/hooks/useCustomerReturns';
import {
  CR_RETURN_REASONS,
  CR_SOURCE_LABELS,
  type CustomerReturnSource,
  type ReturnableOrderLine,
} from '@/types/customer-returns.types';
import { ReturnPhotoPicker } from './return-photo-picker';

interface Props {
  order: { id: string; customerName?: string } | null;
  defaultSource?: CustomerReturnSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened?: () => void;
}

const SOURCES: CustomerReturnSource[] = ['damage_report', 'rts', 'shipped_back'];

/** Opens a customer return case for an order. The owners decide what happens next. */
export function OpenReturnDialog({ order, defaultSource = 'damage_report', open, onOpenChange, onOpened }: Props) {
  const { toast } = useToast();
  const [lines, setLines] = useState<ReturnableOrderLine[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [source, setSource] = useState<CustomerReturnSource>(defaultSource);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [parcelHere, setParcelHere] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !order) return;
    setSource(defaultSource);
    setReason('');
    setNotes('');
    setPhotos([]);
    setParcelHere(false);
    setError(null);
    setLoading(true);
    fetchReturnableLines(order.id)
      .then((l) => {
        setLines(l);
        // An RTS parcel usually holds the whole order; a damage report is usually one piece.
        setQty(Object.fromEntries(l.map((x) => [x.orderItemId, defaultSource === 'rts' ? Math.max(0, x.orderedQty - x.inOpenCaseQty) : 0])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, order, defaultSource]);

  const total = Object.values(qty).reduce((s, n) => s + (n || 0), 0);

  const submit = async () => {
    if (!order) return;
    if (!reason) return setError('Pick a reason.');
    if (total === 0) return setError('Enter how many pieces of at least one item.');
    setSaving(true);
    setError(null);
    try {
      const out = await openCustomerReturn({
        orderId: order.id,
        source,
        reason,
        notes,
        photoUrls: photos,
        parcelHere: source === 'rts' ? parcelHere : undefined,
        items: Object.entries(qty).filter(([, n]) => n > 0).map(([orderItemId, n]) => ({ orderItemId, qty: n })),
      });
      toast({ title: `Return #${out.caseNo} opened`, description: 'The owners were told. Track it on Inventory Management → Returns.' });
      onOpened?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Open a return case</DialogTitle>
          <DialogDescription>
            Order #{order?.id.slice(0, 7).toUpperCase()}{order?.customerName ? ` · ${order.customerName}` : ''}. Nothing goes back in
            stock yet: the owners decide, then each returned piece is checked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What happened?</Label>
            <Select value={source} onValueChange={(v) => { setSource(v as CustomerReturnSource); setReason(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => <SelectItem key={s} value={s}>{CR_SOURCE_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Pick a reason" /></SelectTrigger>
              <SelectContent>
                {CR_RETURN_REASONS[source].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Which pieces?</Label>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="space-y-1.5">
                {lines.map((l) => {
                  const free = Math.max(0, l.orderedQty - l.inOpenCaseQty);
                  return (
                    <div key={l.orderItemId} className="flex items-center justify-between gap-2 rounded border p-2">
                      <div className="min-w-0">
                        <p className="text-sm leading-tight break-words">{l.productName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Ordered {l.orderedQty}{l.inOpenCaseQty ? ` · ${l.inOpenCaseQty} already in an open case` : ''}
                        </p>
                      </div>
                      <Input
                        type="number" inputMode="numeric" min={0} max={free} className="w-16 shrink-0" disabled={free === 0}
                        value={qty[l.orderItemId] ?? 0}
                        onChange={(e) => setQty((q) => ({ ...q, [l.orderItemId]: Math.max(0, Math.min(free, Math.round(Number(e.target.value) || 0))) }))}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {source === 'rts' && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={parcelHere} onCheckedChange={(v) => setParcelHere(v === true)} />
              The parcel is already here at the warehouse
            </label>
          )}

          <div className="space-y-1.5">
            <Label>Photos {source === 'damage_report' ? '(from the customer)' : '(optional)'}</Label>
            <ReturnPhotoPicker urls={photos} onChange={setPhotos} disabled={saving} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="or-notes">Note (optional)</Label>
            <Textarea id="or-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What the customer said" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Open case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
