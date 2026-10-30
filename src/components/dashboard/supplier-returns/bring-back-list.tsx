'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { SupplierReturn, SupplierReturnAction, SupplierReturnSupplier } from '@/types/supplier-returns.types';
import type { ReturnDialogKind } from './return-action-dialog';

const UNKNOWN = '__unknown__';

interface Props {
  toReturn: SupplierReturn[];
  suppliers: SupplierReturnSupplier[];
  onActMany: (actions: SupplierReturnAction[]) => Promise<void>;
  onAction: (kind: ReturnDialogKind, ret: SupplierReturn) => void;
}

/**
 * Owners only: what to bring back on the next buying trip, grouped by supplier.
 * One tap hands back a supplier's whole pile (Shopee: return requested in the
 * app). Pinduoduo takes no returns, so each item gets a discount shortcut.
 */
export function BringBackList({ toReturn, suppliers, onActMany, onAction }: Props) {
  const { toast } = useToast();
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [pickedSupplier, setPickedSupplier] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, SupplierReturn[]>();
    for (const r of toReturn) {
      const key = r.supplierId || r.suggestedSupplierId || UNKNOWN;
      map.set(key, [...(map.get(key) || []), r]);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        name: key === UNKNOWN ? 'Supplier not known' : suppliers.find((s) => s.id === key)?.name || 'Supplier',
        channel: items[0].channel,
        items,
      }))
      .sort((a, b) => Number(a.key === UNKNOWN) - Number(b.key === UNKNOWN) || b.items.length - a.items.length);
  }, [toReturn, suppliers]);

  if (groups.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(unchecked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setUnchecked(next);
  };

  const handBack = async (key: string, items: SupplierReturn[]) => {
    const supplierId = key === UNKNOWN ? pickedSupplier || null : key;
    if (key === UNKNOWN && !supplierId) {
      toast({ title: 'Pick the supplier first', variant: 'destructive' });
      return;
    }
    const chosen = items.filter((r) => !unchecked.has(r.id));
    if (chosen.length === 0) return;
    setBusy(key);
    try {
      await onActMany(chosen.map((r) => ({ action: 'hand_back', id: r.id, supplierId })));
      toast({ title: `${chosen.length} return(s) marked handed back` });
    } catch (e) {
      toast({ title: 'Some could not be saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40">
      <div className="px-3 py-2 border-b border-indigo-200 text-sm font-semibold text-indigo-950">
        Bring back on your next trip (owners only)
      </div>
      <div className="divide-y divide-indigo-100">
        {groups.map((g) => {
          const chosenCount = g.items.filter((r) => !unchecked.has(r.id)).length;
          return (
            <div key={g.key} className="p-3 space-y-2">
              <p className="text-sm font-semibold">
                {g.name}
                {g.channel === 'shopee' && <span className="ml-2 text-xs font-normal text-orange-700">return in the Shopee app</span>}
                {g.channel === 'pinduoduo' && <span className="ml-2 text-xs font-normal text-rose-700">no returns, discount only</span>}
              </p>
              <ul className="space-y-1.5">
                {g.items.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    {g.channel !== 'pinduoduo' && (
                      <Checkbox checked={!unchecked.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Include ${r.productName}`} />
                    )}
                    <span className="min-w-0 flex-1 break-words">
                      {r.openQty} × {r.productName}
                      <span className="text-xs text-muted-foreground"> · {r.reason} · {r.daysWaiting}d</span>
                    </span>
                    {g.channel === 'pinduoduo' && (
                      <Button size="sm" variant="outline" onClick={() => onAction('pdd_discount', r)}>Record discount</Button>
                    )}
                  </li>
                ))}
              </ul>
              {g.channel !== 'pinduoduo' && (
                <div className="flex flex-wrap items-center gap-2">
                  {g.key === UNKNOWN && (
                    <Select value={pickedSupplier} onValueChange={setPickedSupplier}>
                      <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Which supplier?" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" onClick={() => handBack(g.key, g.items)} disabled={busy === g.key || chosenCount === 0}>
                    {busy === g.key && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    {g.channel === 'shopee' ? `Return requested in Shopee app (${chosenCount})` : `Handed back (${chosenCount})`}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
