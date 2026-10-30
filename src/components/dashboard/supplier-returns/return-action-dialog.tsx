'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  OUTCOME_LABELS,
  type SupplierReturn,
  type SupplierReturnAction,
  type SupplierReturnSupplier,
} from '@/types/supplier-returns.types';

export type ReturnDialogKind = 'hand_back' | 'replacement' | 'close' | 'cancel' | 'pdd_discount';

type CloseOutcome = Extract<SupplierReturnAction, { action: 'close' }>['outcome'];
const CLOSE_OUTCOMES: CloseOutcome[] = ['refunded', 'partial_refund_kept', 'voucher', 'written_off'];
const NO_SUPPLIER = '__none__';

interface Props {
  kind: ReturnDialogKind | null;
  ret: SupplierReturn | null;
  suppliers: SupplierReturnSupplier[];
  onClose: () => void;
  onSubmit: (action: SupplierReturnAction) => Promise<void>;
}

const TITLES: Record<ReturnDialogKind, string> = {
  hand_back: 'Handed back to supplier',
  replacement: 'Replacement arrived',
  close: 'Close this return',
  cancel: 'Not returning it',
  pdd_discount: 'Pinduoduo discount (no return)',
};

export function ReturnActionDialog({ kind, ret, suppliers, onClose, onSubmit }: Props) {
  const [supplierId, setSupplierId] = useState<string>(NO_SUPPLIER);
  const [unitCost, setUnitCost] = useState('');
  const [qty, setQty] = useState('');
  const [outcome, setOutcome] = useState<CloseOutcome>('refunded');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind || !ret) return;
    setSupplierId(ret.supplierId || ret.suggestedSupplierId || NO_SUPPLIER);
    setUnitCost(ret.unitCost != null ? String(ret.unitCost) : '');
    setQty(String(ret.openQty));
    setOutcome('refunded');
    setAmount('');
    setNote('');
    setError(null);
  }, [kind, ret]);

  if (!kind || !ret) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    const cost = unitCost.trim() === '' ? null : Number(unitCost);
    try {
      if (kind === 'hand_back') {
        await onSubmit({ action: 'hand_back', id: ret.id, supplierId: supplierId === NO_SUPPLIER ? null : supplierId, unitCost: cost });
      } else if (kind === 'replacement') {
        await onSubmit({ action: 'replacement', id: ret.id, qty: Math.round(Number(qty)) });
      } else if (kind === 'pdd_discount') {
        await onSubmit({
          action: 'close', id: ret.id, outcome: 'partial_refund_kept', amount: Number(amount) || 0,
          note: note.trim() || 'Pinduoduo discount (no return)', supplierId: ret.supplierId || ret.suggestedSupplierId || null,
        });
      } else if (kind === 'close') {
        await onSubmit({ action: 'close', id: ret.id, outcome, amount: Number(amount) || 0, note: note.trim() || undefined });
      } else {
        await onSubmit({ action: 'cancel', id: ret.id, note: note.trim() || undefined });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const showAmount = kind === 'close' && outcome !== 'written_off';

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLES[kind]}</DialogTitle>
          <DialogDescription>
            Return #{ret.returnNo}: {ret.openQty} × {ret.productName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {kind === 'hand_back' && (
            <>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUPPLIER}>Not sure yet</SelectItem>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ra-cost">Cost per piece (optional)</Label>
                <Input id="ra-cost" type="number" inputMode="decimal" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              </div>
            </>
          )}

          {kind === 'replacement' && (
            <div className="space-y-1.5">
              <Label htmlFor="ra-qty">Pieces received (still owed: {ret.openQty})</Label>
              <Input id="ra-qty" type="number" inputMode="numeric" min={1} max={ret.openQty} value={qty} onChange={(e) => setQty(e.target.value)} />
              <p className="text-xs text-muted-foreground">They go back on the shelf count. Fewer than owed keeps the rest open.</p>
            </div>
          )}

          {kind === 'close' && (
            <>
              <div className="space-y-1.5">
                <Label>What did the supplier give for the {ret.openQty} pc(s) still owed?</Label>
                <Select value={outcome} onValueChange={(v) => setOutcome(v as CloseOutcome)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLOSE_OUTCOMES.map((o) => <SelectItem key={o} value={o}>{OUTCOME_LABELS[o]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {showAmount && (
                <div className="space-y-1.5">
                  <Label htmlFor="ra-amount">Amount (₱)</Label>
                  <Input id="ra-amount" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
              )}
            </>
          )}

          {kind === 'pdd_discount' && (
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                Pinduoduo doesn&apos;t take returns. Record the discount they gave; we keep the item and it stays out of stock.
              </p>
              <Label htmlFor="ra-pdd">Discount (₱)</Label>
              <Input id="ra-pdd" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          )}

          {kind === 'cancel' && (
            <p className="text-sm text-muted-foreground">
              The {ret.openQty} pc(s) go back on the shelf count, for example if the item turned out to be fine.
            </p>
          )}

          {(kind === 'close' || kind === 'cancel') && (
            <div className="space-y-1.5">
              <Label htmlFor="ra-note">Note (optional)</Label>
              <Textarea id="ra-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Back</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
