'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ProductPicker } from '@/components/dashboard/procurement/product-picker';
import { useToast } from '@/hooks/use-toast';
import { reportDamagedItem } from '@/hooks/useSupplierReturns';
import { FOUND_AT_LABELS, SUPPLIER_RETURN_REASONS, type SupplierReturnFoundAt } from '@/types/supplier-returns.types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-filled product (e.g. from the Inventory List). Omit to pick one. */
  product?: { id: string; name: string } | null;
  defaultFoundAt?: SupplierReturnFoundAt;
  /** Extra next-step line shown in the form and the saved message (e.g. for pickers). */
  hint?: string;
  onReported?: () => void;
}

/** Set damaged pieces aside to return to the supplier. Takes them off the shelf count. */
export function ReportDamagedDialog({ open, onClose, product, defaultFoundAt = 'shelf', hint, onReported }: Props) {
  const { toast } = useToast();
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState<string>(SUPPLIER_RETURN_REASONS[0]);
  const [foundAt, setFoundAt] = useState<SupplierReturnFoundAt>(defaultFoundAt);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(product ?? null);
    setQty('1');
    setReason(SUPPLIER_RETURN_REASONS[0]);
    setFoundAt(defaultFoundAt);
    setNotes('');
  }, [open, product, defaultFoundAt]);

  const qtyNum = Math.round(Number(qty));
  const canSave = !!picked && qtyNum > 0 && !saving;

  const save = async () => {
    if (!picked || !canSave) return;
    setSaving(true);
    try {
      const out = await reportDamagedItem({ productId: picked.id, qty: qtyNum, reason, foundAt, notes });
      toast({
        title: `Return #${out.returnNo} recorded`,
        description: `${qtyNum} × ${picked.name} set aside. Keep it in the returns pile for the owners.${hint ? ' ' + hint : ''}`,
      });
      onReported?.();
      onClose();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report damaged item</DialogTitle>
          <DialogDescription>
            Set it aside to return to the supplier. It comes off the shelf count so nobody picks it.
            {hint ? ` ${hint}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product</Label>
            {product ? (
              <p className="text-sm font-medium">{product.name}</p>
            ) : picked ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{picked.name}</p>
                <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>Change</Button>
              </div>
            ) : (
              <ProductPicker label="Search product" onSelect={setPicked} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sr-qty">Pieces</Label>
              <Input id="sr-qty" type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Found</Label>
              <Select value={foundAt} onValueChange={(v) => setFoundAt(v as SupplierReturnFoundAt)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FOUND_AT_LABELS) as SupplierReturnFoundAt[]).map((k) => (
                    <SelectItem key={k} value={k}>{FOUND_AT_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>What's wrong</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPLIER_RETURN_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr-notes">Notes (optional)</Label>
            <Textarea id="sr-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. cracked lid, 2 pcs from the same box" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Set aside to return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
