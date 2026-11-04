'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRecountPage } from '@/hooks/useRecountPage';
import { RecountLine } from '@/components/dashboard/inventory/recount-line';
import type { RecountPageRow } from '@/types/inventory-guardian.types';

const phTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const phDay = (d: string | null) =>
  d ? new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric' }) : '';

/**
 * Pabilang (recount) page: the owners asked Jas to count these products.
 * Each product is saved on its own, so she can stop and come back later.
 * The count is blind: the system's numbers aren't shown.
 */
export default function RecountPage() {
  const { rows, loading, error, save } = useRecountPage();
  const [query, setQuery] = useState('');

  const batches = useMemo(() => {
    const map = new Map<string, RecountPageRow[]>();
    rows.forEach((r) => map.set(r.batchId, [...(map.get(r.batchId) || []), r]));
    return Array.from(map.values());
  }, [rows]);

  const q = query.trim().toLowerCase();
  const matches = (r: RecountPageRow) => !q || r.productName.toLowerCase().includes(q) || (r.sku || '').toLowerCase().includes(q);
  const byName = (a: RecountPageRow, b: RecountPageRow) => a.productName.localeCompare(b.productName);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold font-headline">
          <ClipboardCheck className="h-6 w-6 text-primary" /> Pabilang (Recount)
        </h1>
        <p className="text-sm text-muted-foreground">
          Bilangin ang nasa Unit 1 (shelf). Ilagay 0 kung wala. Bawat produkto ay naka-save agad,
          kaya puwedeng ituloy mamaya.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Hanapin ang produkto" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>

      {loading && <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && batches.length === 0 && (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Walang pabilang ngayon. Salamat!</CardContent></Card>
      )}

      {batches.map((batch) => {
        const head = batch[0];
        const open = batch.filter((r) => r.status === 'open').filter(matches).sort(byName);
        const done = batch.filter((r) => r.status === 'done').filter(matches).sort(byName);
        const doneCount = batch.filter((r) => r.status === 'done').length;
        const pct = Math.round((doneCount / batch.length) * 100);
        return (
          <Card key={head.batchId}>
            <CardHeader className="space-y-2">
              <CardTitle className="text-base">{head.message}</CardTitle>
              <CardDescription>
                {head.requestedByName && <>— {head.requestedByName} · </>}
                Hiniling {phTime(head.createdAt)}{head.dueDate && <> · Tapusin bago {phDay(head.dueDate)}</>}
              </CardDescription>
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-sm font-medium">{doneCount} sa {batch.length} ang nabilang na</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {open.map((r) => <RecountLine key={r.id} row={r} onSave={save} />)}
              {open.length === 0 && doneCount < batch.length && <p className="text-sm text-muted-foreground">Walang tugma sa hinahanap.</p>}

              {done.length > 0 && (
                <details className="rounded-md border bg-muted/30 p-3" open={open.length === 0}>
                  <summary className="cursor-pointer text-sm font-semibold text-green-700">
                    <CheckCircle2 className="mr-1 inline h-4 w-4" /> Nabilang na ({done.length})
                  </summary>
                  <ul className="mt-2 divide-y text-sm">
                    {done.map((r) => (
                      <li key={r.id} className="flex flex-wrap justify-between gap-x-3 py-2">
                        <span className="font-medium">{r.productName}</span>
                        <span className="text-muted-foreground">
                          Unit 1: {r.countedUnit1}{r.countedUnit2 != null && <> · Unit 2: {r.countedUnit2}</>} · {r.doneByName} {phTime(r.doneAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
