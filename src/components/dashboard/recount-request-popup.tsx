'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useRecountRequests } from '@/hooks/useRecountRequests';

const REOPEN_MS = 30 * 60 * 1000;

/**
 * Sticky pop-up on Jas's accounts: an owner asked her to count these products.
 * It can be minimized to a red chip while she goes to count, but it comes back
 * every 30 minutes and on every page load until each product is counted.
 * The count is blind: the system's numbers aren't shown.
 */
export function RecountRequestPopup() {
  const { toast } = useToast();
  const { requests, save } = useRecountRequests();
  const [minimized, setMinimized] = useState(false);
  const [counts, setCounts] = useState<Record<string, { u1: string; u2: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!minimized) return;
    const t = setTimeout(() => setMinimized(false), REOPEN_MS);
    return () => clearTimeout(t);
  }, [minimized]);

  const batches = useMemo(() => {
    const map = new Map<string, typeof requests>();
    requests.forEach((r) => map.set(r.batchId, [...(map.get(r.batchId) || []), r]));
    return Array.from(map.values());
  }, [requests]);

  if (requests.length === 0) return null;

  const setCount = (id: string, key: 'u1' | 'u2', value: string) =>
    setCounts((c) => ({ ...c, [id]: { u1: c[id]?.u1 ?? '', u2: c[id]?.u2 ?? '', [key]: value } }));

  const submit = async (id: string, name: string) => {
    const c = counts[id];
    if (!c || c.u1.trim() === '' || c.u2.trim() === '') {
      toast({ title: 'Ilagay ang bilang sa Unit 1 at Unit 2', description: 'Ilagay 0 kung wala.', variant: 'destructive' });
      return;
    }
    setSavingId(id);
    try {
      await save(id, Number(c.u1), Number(c.u2));
      toast({ title: 'Salamat! Na-save ang bilang', description: name });
    } catch (e) {
      toast({ title: 'Hindi na-save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-700"
      >
        <AlertTriangle className="h-4 w-4" /> {requests.length} pabilang pa
      </button>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) setMinimized(true); }}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {batches.map((batch) => (
          <div key={batch[0].batchId} className="space-y-3">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" /> Pabilang
              </DialogTitle>
              <DialogDescription className="text-base text-slate-900">
                {batch[0].message}
                {batch[0].requestedByName && <span className="block text-sm text-muted-foreground mt-1">— {batch[0].requestedByName}</span>}
              </DialogDescription>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Bilangin ang nasa Unit 1 (shelf) at Unit 2 (reserve). Ilagay 0 kung wala.
            </p>
            <ul className="space-y-3">
              {batch.map((r) => (
                <li key={r.id} className="rounded-md border p-3 space-y-2">
                  <p className="font-medium leading-tight">{r.productName}{r.sku ? <span className="text-xs text-muted-foreground"> · {r.sku}</span> : null}</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-muted-foreground">
                      Unit 1
                      <Input type="number" inputMode="numeric" min={0} className="h-9 w-20" value={counts[r.id]?.u1 ?? ''} onChange={(e) => setCount(r.id, 'u1', e.target.value)} />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Unit 2
                      <Input type="number" inputMode="numeric" min={0} className="h-9 w-20" value={counts[r.id]?.u2 ?? ''} onChange={(e) => setCount(r.id, 'u2', e.target.value)} />
                    </label>
                    <Button size="sm" onClick={() => submit(r.id, r.productName)} disabled={savingId === r.id}>
                      {savingId === r.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}I-save
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <Button variant="ghost" className="w-full" onClick={() => setMinimized(true)}>
          Mamaya na, bibilangin ko pa
        </Button>
      </DialogContent>
    </Dialog>
  );
}
