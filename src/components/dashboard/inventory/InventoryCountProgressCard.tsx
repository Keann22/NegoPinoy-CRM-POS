'use client';

import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Search,
  Users,
  Target,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type {
  InventoryCountProgressSummary,
  InventoryCountProgressItem,
} from '@/types/inventory-guardian.types';

interface Props {
  progress: InventoryCountProgressSummary;
}

const phTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export function InventoryCountProgressCard({ progress }: Props) {
  const [filter, setFilter] = useState<'all' | 'matched' | 'diff'>('all');
  const [search, setSearch] = useState('');

  const { today, staffBreakdown, recentItems, history } = progress;

  const filteredItems = useMemo(() => {
    return recentItems.filter((item: InventoryCountProgressItem) => {
      if (filter === 'matched' && item.discrepancy !== 0) return false;
      if (filter === 'diff' && item.discrepancy === 0) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.productName.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        item.actorName.toLowerCase().includes(q)
      );
    });
  }, [recentItems, filter, search]);

  return (
    <div className="space-y-4">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Match Metric */}
        <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-400">
              <span>Tugma sa Shelf (Matches)</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
              {today.matchedCount} <span className="text-sm font-normal text-muted-foreground">/ {today.totalCounted}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
            <span>Accuracy Rate: <strong>{today.accuracyRate}%</strong></span>
            {today.matchedCount > 0 && (
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-1.5 py-0 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> May Tumugma!
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Discrepancy Metric */}
        <Card className="border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-400">
              <span>May Discrepancy (Inayos)</span>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {today.discrepancyCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-amber-700 dark:text-amber-300">
            Na-update ang system sa tunay na bilang sa shelf.
          </CardContent>
        </Card>

        {/* Staff Breakdown */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-semibold">
              <span>Nabilang ng Staff Ngayon</span>
              <Users className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-base font-semibold">
              {staffBreakdown.length} Staff Contributing
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-1">
            <div className="flex flex-wrap gap-1.5">
              {staffBreakdown.map((s) => (
                <span
                  key={s.staffName}
                  className="inline-flex items-center gap-1 text-[11px] bg-muted px-2 py-0.5 rounded border"
                >
                  <span className="font-medium">{s.staffName}:</span>
                  <span className="text-muted-foreground">{s.totalCounted} bilang</span>
                  {s.matchedCount > 0 && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      ({s.matchedCount} tama)
                    </span>
                  )}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historical Progress Trend (Past 14 Days) */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" /> Pag-usad ng Accuracy sa Pagbibilang (14 Araw)
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                Layunin: Palakihin ang porsyento ng tugma sa shelf
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {history.slice(0, 10).map((h) => {
                const isToday = h.date === today.date;
                return (
                  <div key={h.date} className="flex items-center gap-3 text-xs">
                    <span className={`w-24 font-mono font-medium ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                      {h.date} {isToday ? '(Ngayon)' : ''}
                    </span>
                    <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden flex">
                      <div
                        className="bg-emerald-600 transition-all duration-300"
                        style={{ width: `${h.accuracyRate}%` }}
                      />
                      <div
                        className="bg-amber-400 transition-all duration-300"
                        style={{ width: `${100 - h.accuracyRate}%` }}
                      />
                    </div>
                    <span className="w-28 text-right font-medium">
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">{h.matchedCount} tama</span>
                      <span className="text-muted-foreground font-normal"> / {h.totalCounted} ({h.accuracyRate}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verified Items Log */}
      <Card>
        <CardHeader className="p-4 pb-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Mga Nabilang sa Shelf
              </CardTitle>
              <CardDescription className="text-xs">
                Inihahambing ang physical shelf count laban sa dating unallocated stock ng system.
              </CardDescription>
            </div>
            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-muted p-1 rounded-md text-xs">
              <button
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filter === 'all' ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Lahat ({recentItems.length})
              </button>
              <button
                onClick={() => setFilter('matched')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filter === 'matched' ? 'bg-background font-semibold text-emerald-700 shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Tugma ({today.matchedCount})
              </button>
              <button
                onClick={() => setFilter('diff')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filter === 'diff' ? 'bg-background font-semibold text-amber-700 shadow-sm' : 'text-muted-foreground'
                }`}
              >
                May Diff ({today.discrepancyCount})
              </button>
            </div>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hanapin ang produkto, SKU, o staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          {filteredItems.length === 0 ? (
            <p className="text-center py-6 text-xs text-muted-foreground">
              Walang nahanap na nabilang na item.
            </p>
          ) : (
            <div className="divide-y text-xs">
              {filteredItems.map((item) => {
                const isMatch = item.discrepancy === 0;
                return (
                  <div key={item.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{item.productName}</span>
                        {item.sku && <span className="text-[11px] text-muted-foreground font-mono">({item.sku})</span>}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                        <span>Nagbilang: <strong>{item.actorName}</strong></span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {phTime(item.createdAt)}
                        </span>
                        {item.notes && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[200px]" title={item.notes}>{item.notes}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stock comparison & status badge */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <div className="text-right text-[11px]">
                        <div>Physical shelf: <strong>{item.physicalCount}</strong></div>
                        <div className="text-muted-foreground">Dati sa system: {item.systemStockBefore ?? '-'}</div>
                      </div>

                      {isMatch ? (
                        <Badge className="bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 gap-1 text-[11px]">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Tugma sa Shelf
                        </Badge>
                      ) : item.discrepancy > 0 ? (
                        <Badge className="bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300 hover:bg-amber-100 gap-1 text-[11px]">
                          <AlertTriangle className="h-3 w-3 text-amber-600" /> Sobra ng +{item.discrepancy}
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300 hover:bg-rose-100 gap-1 text-[11px]">
                          <AlertTriangle className="h-3 w-3 text-rose-600" /> Kulang ng {item.discrepancy}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
