'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Search,
  TrendingUp,
  Target,
  ListFilter,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useRecountPage } from '@/hooks/useRecountPage';
import { useInventoryCountProgress } from '@/hooks/useInventoryCountProgress';
import { RecountLine } from '@/components/dashboard/inventory/recount-line';
import { InventoryCountProgressCard } from '@/components/dashboard/inventory/InventoryCountProgressCard';
import type { RecountPageRow } from '@/types/inventory-guardian.types';

const phTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

const phDay = (d: string | null) =>
  d
    ? new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '';

/**
 * Pabilang (recount) page: the owners asked Jas to count these products.
 * Includes accuracy progress tracking to measure if unallocated stocks match physical shelf counts.
 */
export default function RecountPage() {
  const [activeTab, setActiveTab] = useState<'batches' | 'progress'>('batches');
  const { rows, loading, error, save } = useRecountPage();
  const { progress: countProgress, loading: loadingProgress } = useInventoryCountProgress(14);
  const [query, setQuery] = useState('');

  const batches = useMemo(() => {
    const map = new Map<string, RecountPageRow[]>();
    rows.forEach((r) => map.set(r.batchId, [...(map.get(r.batchId) || []), r]));
    return Array.from(map.values());
  }, [rows]);

  const q = query.trim().toLowerCase();
  const matches = (r: RecountPageRow) =>
    !q || r.productName.toLowerCase().includes(q) || (r.sku || '').toLowerCase().includes(q);
  const byName = (a: RecountPageRow, b: RecountPageRow) => a.productName.localeCompare(b.productName);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      {/* Header and Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold font-headline">
            <ClipboardCheck className="h-6 w-6 text-primary" /> Pabilang (Recount)
          </h1>
          <p className="text-sm text-muted-foreground">
            Bilangin ang nasa Unit 1 (shelf). Bawat produkto ay naka-save agad.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg self-start sm:self-auto text-xs">
          <Button
            type="button"
            variant={activeTab === 'batches' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('batches')}
            className="h-8 gap-1.5 text-xs"
          >
            <ListFilter className="h-3.5 w-3.5" /> Mga Pabilang
          </Button>
          <Button
            type="button"
            variant={activeTab === 'progress' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('progress')}
            className="h-8 gap-1.5 text-xs"
          >
            <TrendingUp className="h-3.5 w-3.5" /> Pag-usad ng Bilang
          </Button>
        </div>
      </div>

      {/* Progress Tab View */}
      {activeTab === 'progress' && (
        <>
          {loadingProgress && (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {!loadingProgress && countProgress && (
            <InventoryCountProgressCard progress={countProgress} />
          )}
        </>
      )}

      {/* Batches Tab View */}
      {activeTab === 'batches' && (
        <>
          {/* Quick Accuracy Banner */}
          {countProgress && countProgress.today.totalCounted > 0 && (
            <div className="p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-600" />
                <span>
                  <strong>Pag-usad Ngayon:</strong> {countProgress.today.matchedCount} sa {countProgress.today.totalCounted} tumugma sa unallocated shelf stock (<strong>{countProgress.today.accuracyRate}% Accuracy</strong>)
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab('progress')}
                className="h-6 px-2 text-[11px] text-emerald-700 dark:text-emerald-300 hover:text-emerald-800"
              >
                Tingnan ang detalye →
              </Button>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hanapin ang produkto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading && (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && batches.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Walang pabilang ngayon. Salamat!
              </CardContent>
            </Card>
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
                    Hiniling {phTime(head.createdAt)}
                    {head.dueDate && <> · Tapusin bago {phDay(head.dueDate)}</>}
                  </CardDescription>
                  <div className="space-y-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-sm font-medium">
                      {doneCount} sa {batch.length} ang nabilang na
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {open.map((r) => (
                    <RecountLine key={r.id} row={r} onSave={save} />
                  ))}
                  {open.length === 0 && doneCount < batch.length && (
                    <p className="text-sm text-muted-foreground">Walang tugma sa hinahanap.</p>
                  )}

                  {done.length > 0 && (
                    <details className="rounded-md border bg-muted/30 p-3" open={open.length === 0}>
                      <summary className="cursor-pointer text-sm font-semibold text-green-700">
                        <CheckCircle2 className="mr-1 inline h-4 w-4" /> Nabilang na ({done.length})
                      </summary>
                      <ul className="mt-2 divide-y text-sm">
                        {done.map((r) => {
                          const isMatch = r.systemBefore != null && (r.countedUnit1 ?? 0) === r.systemBefore;
                          const diff =
                            r.systemBefore != null ? (r.countedUnit1 ?? 0) - r.systemBefore : null;

                          return (
                            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2">
                              <span className="font-medium">{r.productName}</span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-muted-foreground text-xs">
                                  Unit 1: {r.countedUnit1}
                                  {r.countedUnit2 != null && <> · Unit 2: {r.countedUnit2}</>} · {r.doneByName}{' '}
                                  {phTime(r.doneAt)}
                                </span>
                                {isMatch ? (
                                  <Badge className="bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300 text-[10px]">
                                    ✓ Tugma sa shelf (0 diff)
                                  </Badge>
                                ) : diff != null && diff > 0 ? (
                                  <Badge className="bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300 text-[10px]">
                                    Sobra ng +{diff} (dati {r.systemBefore})
                                  </Badge>
                                ) : diff != null && diff < 0 ? (
                                  <Badge className="bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300 text-[10px]">
                                    Kulang ng {diff} (dati {r.systemBefore})
                                  </Badge>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
