'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ActivityCategory, StaffActivitySummary } from '@/types';

interface ActivitySummaryStripProps {
  summary: StaffActivitySummary;
  selectedCategory: ActivityCategory | 'all';
  onSelectCategory: (category: ActivityCategory | 'all') => void;
}

interface TileConfig {
  key: ActivityCategory | 'all';
  label: string;
  count: number;
  sublabel?: string;
  alwaysShow: boolean;
}

export function ActivitySummaryStrip({
  summary,
  selectedCategory,
  onSelectCategory,
}: ActivitySummaryStripProps) {
  const { byCategory } = summary;
  const matchPct =
    summary.countsTotal > 0
      ? Math.round((summary.countsMatched / summary.countsTotal) * 100)
      : null;

  const tiles: TileConfig[] = [
    {
      key: 'all',
      label: 'All Activity',
      count: summary.totalActions,
      alwaysShow: true,
    },
    {
      key: 'picking',
      label: 'Picked',
      count: byCategory.picking,
      alwaysShow: true,
    },
    {
      key: 'checking',
      label: 'Second Check',
      count: byCategory.checking,
      alwaysShow: true,
    },
    {
      key: 'packing',
      label: 'Packed',
      count: byCategory.packing,
      alwaysShow: true,
    },
    {
      key: 'receiving',
      label: 'Received & Stock',
      count: byCategory.receiving,
      sublabel: summary.receivedPieces > 0 ? `${summary.receivedPieces} pcs` : undefined,
      alwaysShow: true,
    },
    {
      key: 'counting',
      label: 'Shelf Counts',
      count: byCategory.counting,
      sublabel: matchPct !== null ? `${matchPct}% matched` : undefined,
      alwaysShow: true,
    },
    {
      key: 'returns',
      label: 'Returns',
      count: byCategory.returns,
      alwaysShow: true,
    },
    {
      key: 'tasks',
      label: 'Tasks & Notes',
      count: byCategory.tasks,
      alwaysShow: true,
    },
    {
      key: 'transfers',
      label: '3C ⇄ 4A Transfers',
      count: byCategory.transfers,
      alwaysShow: false,
    },
    {
      key: 'shipping',
      label: 'Bus Shipping',
      count: byCategory.shipping,
      alwaysShow: false,
    },
  ];

  const visibleTiles = tiles.filter(
    (t) => t.alwaysShow || t.count > 0 || selectedCategory === t.key
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
      {visibleTiles.map((tile) => {
        const isActive = selectedCategory === tile.key;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() =>
              onSelectCategory(
                tile.key === 'all' ? 'all' : isActive ? 'all' : tile.key
              )
            }
            className="text-left focus:outline-none"
          >
            <Card
              className={cn(
                'h-full transition-colors hover:bg-muted/50',
                isActive && 'border-primary ring-1 ring-primary bg-primary/5'
              )}
            >
              <CardContent className="p-3">
                <div className="text-xs font-medium text-muted-foreground truncate">
                  {tile.label}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tabular-nums">{tile.count}</span>
                  {tile.sublabel && (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {tile.sublabel}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
