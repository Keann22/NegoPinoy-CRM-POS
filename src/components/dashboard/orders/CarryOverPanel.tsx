'use client';

import { useEffect, useState } from 'react';
import { PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { CarryOver } from '@/lib/services/carryover-service';

const peso = (n: number) => `₱${(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

/**
 * New Order: the customer's "to follow" items from earlier orders, with Add.
 * Edit Order: items being removed or reduced, with "To follow?" so the
 * customer gets them with their next order.
 */
type Props =
  | {
      mode: 'create';
      customerId: string | null | undefined;
      storeCredit: number | null | undefined;
      addedIds: string[];
      onAdd: (c: CarryOver) => void;
    }
  | {
      mode: 'edit';
      originalItems: any[];
      currentItems: { productId: string; quantity: number }[];
      selected: Record<string, boolean>;
      onToggle: (productId: string, checked: boolean) => void;
    };

export function CarryOverPanel(props: Props) {
  return props.mode === 'create' ? <CreateReminder {...props} /> : <EditPicker {...props} />;
}

function CreateReminder({ customerId, storeCredit, addedIds, onAdd }: Extract<Props, { mode: 'create' }>) {
  const [items, setItems] = useState<CarryOver[]>([]);

  useEffect(() => {
    setItems([]);
    if (!customerId) return;
    let cancelled = false;
    fetch(`/api/priority/carryovers?customerId=${encodeURIComponent(customerId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { carryOvers: [] }))
      .then((d) => { if (!cancelled) setItems(d.carryOvers || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [customerId]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <div className="font-semibold">This customer has items to follow from an earlier order</div>
      <ul className="mt-2 space-y-1.5">
        {items.map((c) => {
          const added = addedIds.includes(c.id);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {c.qty}× {c.productName} — paid {peso(c.unitPrice)} each
                {c.fromOrderId && <> on #{c.fromOrderId.slice(0, 7).toUpperCase()}</>}
              </span>
              <Button type="button" size="sm" variant={added ? 'ghost' : 'outline'} className="h-7" disabled={added} onClick={() => onAdd(c)}>
                <PackagePlus className="mr-1.5 h-4 w-4" />{added ? 'Added' : 'Add to this order'}
              </Button>
            </li>
          );
        })}
      </ul>
      {!!storeCredit && storeCredit > 0 && (
        <p className="mt-2 text-xs">Customer has {peso(storeCredit)} store credit — tick &quot;Apply store credit&quot; so they don&apos;t pay twice.</p>
      )}
    </div>
  );
}

function EditPicker({ originalItems, currentItems, selected, onToggle }: Extract<Props, { mode: 'edit' }>) {
  const now = new Map<string, number>();
  currentItems.forEach((i) => now.set(i.productId, (now.get(i.productId) || 0) + Number(i.quantity || 0)));
  const reduced = originalItems
    .map((o: any) => ({ ...o, removedQty: Number(o.quantity || 0) - (now.get(o.productId) || 0) }))
    .filter((o: any) => o.removedQty > 0);

  if (reduced.length === 0) return null;

  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="font-semibold">Removing items — will the customer still get them later?</div>
      <p className="text-xs text-muted-foreground">Tick the ones to send with the customer&apos;s next order. They stay on the buy list and show up when the customer orders again.</p>
      <ul className="mt-2 space-y-1.5">
        {reduced.map((o: any) => (
          <li key={o.productId}>
            <label className="flex items-center gap-2">
              <Checkbox checked={!!selected[o.productId]} onCheckedChange={(v) => onToggle(o.productId, v === true)} />
              To follow: {o.removedQty}× {o.productName}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
