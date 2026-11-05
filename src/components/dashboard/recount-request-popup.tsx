'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRecountRequests } from '@/hooks/useRecountRequests';
import { RecountLine } from '@/components/dashboard/inventory/recount-line';

const REOPEN_MS = 30 * 60 * 1000;
export const RECOUNT_PAGE = '/dashboard/inventory/recount';
/** More open products than this: only a corner chip that opens the Pabilang page, no pop-up (owner 2026-11-04). */
const INLINE_MAX = 10;

const CHIP = 'fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-700';

/**
 * Recount requests on Jas's and Al's accounts: an owner asked them to count these products.
 * Up to 10 products: a sticky pop-up they can minimize to a red chip, but it comes
 * back every 30 minutes and on every page load until each product is counted.
 * More than 10: just a red chip ("38 pabilang pa") that opens the Pabilang page.
 * Nothing shows on the Pabilang page itself.
 * Jas / Al counts the Unit 1 shelf only (Unit 2 is left as recorded), blind: no system numbers.
 */
export function RecountRequestPopup() {
  const pathname = usePathname();
  const { requests, save, refresh } = useRecountRequests();
  // Counts saved on the Pabilang page: reload when she moves to another page.
  useEffect(() => { refresh(); }, [pathname, refresh]);
  const [minimized, setMinimized] = useState(false);

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

  if (requests.length === 0 || pathname?.startsWith(RECOUNT_PAGE)) return null;
  if (requests.length > INLINE_MAX) {
    return (
      <Link href={RECOUNT_PAGE} className={CHIP}>
        <AlertTriangle className="h-4 w-4" /> {requests.length} pabilang pa
      </Link>
    );
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className={CHIP}
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
              Bilangin ang nasa Unit 1 (shelf). Ilagay 0 kung wala.
            </p>
            <div className="space-y-3">
              {batch.map((r) => <RecountLine key={r.id} row={r} onSave={save} />)}
            </div>
          </div>
        ))}
        <Button asChild className="w-full" variant="outline">
          <Link href={RECOUNT_PAGE}>Buksan ang Pabilang page</Link>
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setMinimized(true)}>
          Mamaya na, bibilangin ko pa
        </Button>
      </DialogContent>
    </Dialog>
  );
}
