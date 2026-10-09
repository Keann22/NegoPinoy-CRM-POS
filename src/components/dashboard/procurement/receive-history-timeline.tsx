'use client';

import { useState, useEffect } from 'react';
import { Truck, Clock, ChevronDown, ChevronUp, ShoppingCart, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type ReceiveEntry = {
  id: string;
  date: string;
  dateLabel: string;
  receivedQty: number;
  expectedQty?: number;
  status?: 'received' | 'partial' | 'awaiting';
  unitCost: number;
  supplierName: string | null;
  label: string;
  detail: string | null;
};

type ReceiveHistory = {
  purchased: ReceiveEntry[];
  direct: ReceiveEntry[];
  purchasedQty: number;
  directQty: number;
};

interface ReceiveHistoryTimelineProps {
  productId: string;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

function EntryRow({ entry, viaPurchase }: { entry: ReceiveEntry; viaPurchase: boolean }) {
  return (
    <div className="p-2 rounded border bg-muted/30 text-[11px] space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {viaPurchase && entry.status !== 'received' ? (
            <>
              <span className="font-mono">{entry.receivedQty}</span> of{' '}
              <span className="font-mono">{entry.expectedQty}</span> received
            </>
          ) : (
            <span className="font-mono text-emerald-700">+{entry.receivedQty}</span>
          )}
          {entry.status === 'awaiting' && (
            <Badge variant="outline" className="ml-1.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
              Awaiting delivery
            </Badge>
          )}
          {entry.status === 'partial' && (
            <Badge variant="outline" className="ml-1.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
              Partial
            </Badge>
          )}
        </span>
        <span className="text-muted-foreground text-[10px] font-mono shrink-0">
          {entry.dateLabel} {formatDate(entry.date)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="truncate" title={entry.label}>
          {entry.label}
          {entry.detail ? ` · ${entry.detail}` : ''}
        </span>
        <span className="shrink-0">
          {entry.supplierName || 'No supplier'} ·{' '}
          {entry.unitCost > 0 ? `₱${entry.unitCost.toLocaleString('en-PH')}` : 'No cost'}
        </span>
      </div>
    </div>
  );
}

export function ReceiveHistoryTimeline({ productId }: ReceiveHistoryTimelineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ReceiveHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset when product changes
    setHistory(null);
    setError(null);
    setIsOpen(false);
  }, [productId]);

  const toggleOpen = async () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    if (nextState && !history) {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/inventory/procurement/receive-history?productId=${encodeURIComponent(productId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load receive history');
        setHistory(data);
      } catch (err: any) {
        console.error('Error fetching receive history:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const total = history ? history.purchased.length + history.direct.length : 0;

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
          <Truck className="h-3.5 w-3.5 text-primary" />
          <span>Received & Purchase History</span>
          {history && total > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-mono">
              {total}
            </Badge>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>

      {isOpen && (
        <div className="p-3 border-t bg-background space-y-3 max-h-64 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-3 text-muted-foreground text-xs gap-2">
              <Clock className="h-3.5 w-3.5 animate-spin" />
              <span>Retrieving receive history...</span>
            </div>
          )}

          {!isLoading && error && (
            <p className="text-center py-2 text-destructive text-[11px]">{error}</p>
          )}

          {!isLoading && history && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-blue-700">
                  <span className="flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    Went through purchase workflow ({history.purchased.length})
                  </span>
                  <span className="font-mono">+{history.purchasedQty} received</span>
                </div>
                {history.purchased.length === 0 ? (
                  <p className="text-muted-foreground text-[11px]">No purchases recorded for this product.</p>
                ) : (
                  history.purchased.map((e) => <EntryRow key={e.id} entry={e} viaPurchase />)
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-amber-700">
                  <span className="flex items-center gap-1">
                    <PackageOpen className="h-3 w-3" />
                    Received without a purchase ({history.direct.length})
                  </span>
                  <span className="font-mono">+{history.directQty} received</span>
                </div>
                {history.direct.length === 0 ? (
                  <p className="text-muted-foreground text-[11px]">Nothing received outside the purchase workflow.</p>
                ) : (
                  history.direct.map((e) => <EntryRow key={e.id} entry={e} viaPurchase={false} />)
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
