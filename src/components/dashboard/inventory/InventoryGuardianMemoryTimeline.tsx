'use client';

import { useState, useEffect } from 'react';
import { History, Clock, User, ChevronDown, ChevronUp, CheckCircle, PackagePlus, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useInventoryGuardian } from '@/hooks/useInventoryGuardian';
import type { InventoryGuardianMemoryEntry } from '@/types';

interface InventoryGuardianMemoryTimelineProps {
  productId: string;
}

export function InventoryGuardianMemoryTimeline({ productId }: InventoryGuardianMemoryTimelineProps) {
  const { fetchProductMemory } = useInventoryGuardian();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [memories, setMemories] = useState<InventoryGuardianMemoryEntry[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // Reset when product changes
    setMemories([]);
    setHasLoaded(false);
    setIsOpen(false);
  }, [productId]);

  const toggleOpen = async () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    if (nextState && !hasLoaded) {
      setIsLoading(true);
      try {
        const data = await fetchProductMemory(productId);
        setMemories(data);
        setHasLoaded(true);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const getActionBadge = (entry: InventoryGuardianMemoryEntry) => {
    switch (entry.actionType) {
      case 'physical_count_audit':
        return (
          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 gap-1">
            <CheckCircle className="h-2.5 w-2.5" />
            Physical Count: {entry.physicalCount ?? 0}
          </Badge>
        );
      case 'purchase_backfill':
        return (
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 gap-1">
            <PackagePlus className="h-2.5 w-2.5" />
            Purchase Backfilled
          </Badge>
        );
      case 'borrow_tagged':
        return (
          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 gap-1">
            <ArrowRightLeft className="h-2.5 w-2.5" />
            Borrowed Stock
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="text-[10px]">{entry.actionType}</Badge>;
    }
  };

  return (
    <div className="border rounded-md bg-muted/20 overflow-hidden text-xs">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between px-3 py-2 h-8 text-muted-foreground hover:text-foreground font-medium"
      >
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-primary" />
          <span>Guardian Memory & Audit Timeline</span>
          {hasLoaded && memories.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-mono">
              {memories.length}
            </Badge>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>

      {isOpen && (
        <div className="p-3 border-t bg-background space-y-2.5 max-h-48 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-3 text-muted-foreground text-xs gap-2">
              <Clock className="h-3.5 w-3.5 animate-spin" />
              <span>Retrieving memory timeline...</span>
            </div>
          )}

          {!isLoading && memories.length === 0 && (
            <p className="text-center py-2 text-muted-foreground text-[11px]">
              No past audit memories found for this product yet.
            </p>
          )}

          {!isLoading && memories.length > 0 && (
            <div className="space-y-2">
              {memories.map((m) => (
                <div key={m.id} className="p-2 rounded border bg-muted/30 text-[11px] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {getActionBadge(m)}
                      <span className="text-muted-foreground flex items-center gap-0.5">
                        <User className="h-3 w-3" />
                        {m.actorName || 'Staff'}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-[10px] font-mono shrink-0">
                      {new Date(m.createdAt).toLocaleDateString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground pt-0.5">
                    <span>
                      Stock: <span className="font-mono text-foreground">{m.systemStockBefore ?? '—'}</span> →{' '}
                      <span className="font-mono font-semibold text-foreground">{m.systemStockAfter ?? '—'}</span>
                    </span>
                    {m.notes && (
                      <span className="italic truncate max-w-[200px]" title={m.notes}>
                        "{m.notes}"
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
