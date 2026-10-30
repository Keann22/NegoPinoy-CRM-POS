'use client';

import { useMemo, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { SupplierReturn, SupplierReturnSupplier } from '@/types/supplier-returns.types';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

interface Props {
  returns: SupplierReturn[];
  suppliers: SupplierReturnSupplier[];
  onSetDays: (supplierId: string, days: number) => Promise<void>;
}

/** Owners only: what each supplier still owes, and each supplier's waiting limit. */
export function SupplierOwedSummary({ returns, suppliers, onSetDays }: Props) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [days, setDays] = useState('');

  const rows = useMemo(() => {
    const map = new Map<string, { id: string | null; name: string; count: number; pcs: number; owed: number; oldest: number; overdue: number; limit: number }>();
    for (const r of returns.filter((x) => x.status !== 'closed')) {
      const key = r.supplierId || 'none';
      const cur = map.get(key) || {
        id: r.supplierId, name: r.supplierName || 'Supplier not set yet', count: 0, pcs: 0, owed: 0, oldest: 0, overdue: 0,
        limit: suppliers.find((s) => s.id === r.supplierId)?.replacementDays ?? r.limitDays,
      };
      cur.count += 1;
      cur.pcs += r.openQty;
      cur.owed += r.owedAmount || 0;
      cur.oldest = Math.max(cur.oldest, r.daysWaiting);
      if (r.isOverdue) cur.overdue += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.overdue - a.overdue || b.oldest - a.oldest);
  }, [returns, suppliers]);

  if (rows.length === 0) return null;

  const save = async (supplierId: string) => {
    try {
      await onSetDays(supplierId, Number(days));
      setEditing(null);
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  return (
    <div className="rounded-lg border">
      <div className="px-3 py-2 border-b bg-muted/40 text-sm font-semibold">Owed by suppliers (owners only)</div>
      <ul className="divide-y">
        {rows.map((s) => (
          <li key={s.id || 'none'} className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-medium min-w-[8rem]">{s.name}</span>
            <span>{s.count} return(s), {s.pcs} pc(s)</span>
            {s.owed > 0 && <span>{peso(s.owed)}</span>}
            <span className={s.overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
              oldest {s.oldest} day(s){s.overdue ? ` · ${s.overdue} overdue` : ''}
            </span>
            {s.id && (
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                Limit:
                {editing === s.id ? (
                  <>
                    <Input className="h-7 w-16" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
                    <span>days</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => save(s.id as string)}><Check className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setEditing(s.id); setDays(String(s.limit)); }}>
                    {s.limit} days <Pencil className="h-3 w-3" />
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
