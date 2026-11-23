'use client';

import { useEffect, useState } from 'react';
import { Loader2, Printer, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/lib/supabase/hooks';
import { searchOrdersToReprint } from '@/lib/services/orders/order-print-service';

type Hit = Awaited<ReturnType<typeof searchOrdersToReprint>>[number];

/** "Reprint an order": type the order # or customer name, tap Print. */
export function ReprintOrderSearch({
  onReprint,
  busy,
}: {
  onReprint: (orderId: string) => void;
  busy: boolean;
}) {
  const supabase = useSupabase();
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!supabase || term.trim().length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    setSearching(true);
    const t = window.setTimeout(async () => {
      const found = await searchOrdersToReprint(supabase, term).catch(() => []);
      if (live) {
        setHits(found);
        setSearching(false);
      }
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [term, supabase]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Reprint an order: order # or customer name"
          className="pl-8"
        />
        {searching && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {hits.length > 0 && (
        <ul className="divide-y rounded-md border">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-mono font-semibold">#{h.code}</span>{' '}
                <span className="truncate">{h.customerName}</span>
                <span className="ml-2 text-xs text-muted-foreground">{h.status}</span>
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onReprint(h.id)}>
                <Printer className="mr-1 h-4 w-4" /> Print
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!searching && term.trim().length >= 2 && hits.length === 0 && (
        <p className="text-xs text-muted-foreground">No order found.</p>
      )}
    </div>
  );
}
