import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export type LineToMatch = { id: string; description: string; createdAt: string };
type Action = 'product' | 'not_product' | 'not_in_list';

// Snapped receipt lines the reader wasn't sure about. Staff match them while
// unpacking; a match records the purchase, so the item moves onto Receiving.
export function useReceiptLinesToMatch(onMatched: () => void, refreshKey = 0) {
  const { toast } = useToast();
  const [lines, setLines] = useState<LineToMatch[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/receipt-lines', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setLines(data.lines || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const resolve = async (lineId: string, action: Action, productId?: string) => {
    setSavingId(lineId);
    try {
      const res = await fetch('/api/inventory/receipt-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId, action, productId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setLines((prev) => prev.filter((l) => l.id !== lineId));
      if (action === 'product') {
        toast({ title: 'Matched', description: 'It is now on the list below. Count it in there.' });
        onMatched();
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: e.message });
      load();
    } finally {
      setSavingId(null);
    }
  };

  return { lines, savingId, resolve };
}
