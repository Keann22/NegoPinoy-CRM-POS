'use client';

import { useEffect, useState } from 'react';
import { Loader2, PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { clearSupplierFlag, setSupplierFlag, useSiblingVariants } from '@/hooks/useSupplierFlags';
import { SUPPLIER_FLAG_LABELS, SUPPLIER_FLAG_RULES, phtDatePlus } from '@/lib/supplier-stock/supplier-flag-rules';
import type { SupplierFlag, SupplierFlagStatus } from '@/types/supplier-stock.types';

const STATUSES: { value: SupplierFlagStatus; help: string }[] = [
  { value: 'waiting_restock', help: "We can't get it anywhere for now. We wait." },
  { value: 'other_variant', help: 'Only another color or size is available.' },
  { value: 'price_up', help: 'The supplier raised the price. Ask the customer first.' },
  { value: 'stop_selling', help: "Bad quality or discontinued. Sell only what's left on the shelf." },
];

/**
 * Owners and Jas set "out at the supplier" on a variant (owner, 2026-11-20).
 * Sales are then asked about every order waiting for it. Opened from the
 * Procurement Sheet and the Wala sa Supplier page.
 */
export function SupplierFlagDialog({
  open, onOpenChange, product, current, oldIssue, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string } | null;
  current?: SupplierFlag | null;
  /** An old free-text report being turned into a status (it gets closed). */
  oldIssue?: { id: string; note: string } | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { variants, currentPrice } = useSiblingVariants(open ? product?.id : null);
  const [status, setStatus] = useState<SupplierFlagStatus>('waiting_restock');
  const [note, setNote] = useState('');
  const [altIds, setAltIds] = useState<string[]>([]);
  const [newPrice, setNewPrice] = useState('');
  const [checkOn, setCheckOn] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus(current?.status || 'waiting_restock');
    setNote(current?.note || oldIssue?.note || '');
    setAltIds(current?.altProductIds?.length ? current.altProductIds : current?.altProductId ? [current.altProductId] : []);
    setNewPrice(current?.newPrice ? String(current.newPrice) : '');
    setCheckOn(current?.checkAgainOn || phtDatePlus(SUPPLIER_FLAG_RULES.checkAgainDays));
  }, [open, current, oldIssue]);

  if (!product) return null;

  const toggleAlt = (id: string) =>
    setAltIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (status === 'other_variant' && variants.length > 0 && altIds.length === 0) {
      toast({ title: 'Pick at least one color/size we can get', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await setSupplierFlag({
        productId: product.id, status, note,
        altProductIds: status === 'other_variant' ? altIds : [],
        newPrice: status === 'price_up' && newPrice ? Number(newPrice) : null,
        checkAgainOn: status === 'stop_selling' ? null : checkOn || null,
        oldIssueId: oldIssue?.id || null,
      });
      toast({ title: SUPPLIER_FLAG_LABELS[status], description: `${product.name}: sales will be asked about the waiting orders.` });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await clearSupplierFlag(product.id);
      toast({ title: 'Available again', description: `${product.name}: agents with waiting orders were told.` });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <PackageX className="h-5 w-5" /> Can&apos;t buy this?
          </DialogTitle>
          <DialogDescription className="break-words">{product.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="radiogroup" aria-label="Status">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={status === s.value}
              onClick={() => setStatus(s.value)}
              className={`w-full rounded-md border p-3 text-left transition-colors ${status === s.value ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40' : 'hover:bg-muted'}`}
            >
              <p className="text-sm font-semibold">{SUPPLIER_FLAG_LABELS[s.value]}</p>
              <p className="text-xs text-muted-foreground">{s.help}</p>
            </button>
          ))}
        </div>

        {status === 'other_variant' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>What we can get instead</Label>
              {variants.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {altIds.length} selected
                </span>
              )}
            </div>
            {variants.length === 0 ? (
              <p className="text-xs text-muted-foreground">This item has no other colors or sizes. Write it in the note.</p>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                {variants.map((v) => (
                  <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                    <Checkbox checked={altIds.includes(v.id)} onCheckedChange={() => toggleAlt(v.id)} />
                    <span className="min-w-0 flex-1 break-words">
                      {v.name}{v.price != null ? ` — ₱${v.price.toLocaleString('en-PH')}` : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {status === 'price_up' && (
          <div className="space-y-1">
            <Label htmlFor="sf-price">New selling price (optional)</Label>
            <Input id="sf-price" type="number" inputMode="decimal" value={newPrice} onChange={(e) => setNewPrice(e.target.value)}
              placeholder={currentPrice != null ? `Now ₱${currentPrice.toLocaleString('en-PH')}` : '₱'} />
          </div>
        )}

        {status !== 'stop_selling' && (
          <div className="space-y-1">
            <Label htmlFor="sf-check">Check the supplier again on</Label>
            <Input id="sf-check" type="date" value={checkOn} onChange={(e) => setCheckOn(e.target.value)} />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="sf-note">Note for sales (optional)</Label>
          <textarea id="sf-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="e.g. may take a while, supplier says 2 weeks"
            className="w-full rounded-md border bg-background p-2 text-sm" />
          <p className="text-[11px] text-muted-foreground">Sales see this. Don&apos;t write the supplier&apos;s name or the cost.</p>
        </div>

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {current ? (
            <Button type="button" variant="outline" disabled={busy} onClick={clear}>Back in stock</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={busy} onClick={save} className="bg-amber-600 text-white hover:bg-amber-700">
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
