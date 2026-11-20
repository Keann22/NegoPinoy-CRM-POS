'use client';

import { useState } from 'react';
import { Loader2, PackageX, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { closeOldIssue, useSupplierFlagPage } from '@/hooks/useSupplierFlags';
import { ProductPicker } from '@/components/dashboard/procurement/product-picker';
import { SupplierFlagDialog } from '@/components/dashboard/supplier-stock/supplier-flag-dialog';
import { SupplierFlagList } from '@/components/dashboard/supplier-stock/supplier-flag-list';
import { OldIssuesList } from '@/components/dashboard/supplier-stock/old-issues-list';
import type { SupplierFlag } from '@/types/supplier-stock.types';

/**
 * Wala sa Supplier (owner, 2026-11-20): items we can't get anywhere for now,
 * with only another color/size, a higher price, or that we stopped selling.
 * Owners and Jas set and clear them; everyone sees what sales answered.
 */
export default function SupplierStockPage() {
  const { toast } = useToast();
  const { flags, oldIssues, canSetStatus, loading, error, reload } = useSupplierFlagPage();
  const [editing, setEditing] = useState<{
    product: { id: string; name: string }; current: SupplierFlag | null; oldIssue: { id: string; note: string } | null;
  } | null>(null);

  const closeOld = async (id: string) => {
    if (!confirm('Close this old report without setting a status?')) return;
    try {
      await closeOldIssue(id);
      await reload();
    } catch (e) {
      toast({ title: 'Could not close', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const unanswered = flags.reduce((n, f) => n + f.orders.filter((o) => !o.covered && (!o.answer || o.answer === 'asked')).length, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><PackageX className="h-6 w-6 text-amber-600" /> Wala sa Supplier</h1>
        <Button variant="ghost" size="sm" onClick={() => reload()} className="ml-auto"><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Items we can&apos;t buy right now. Sales get a pop-up for every order waiting on one, and New Order warns before adding it.
        {unanswered > 0 && <span className="font-semibold text-red-700 dark:text-red-400"> {unanswered} order{unanswered === 1 ? '' : 's'} not answered yet.</span>}
      </p>

      {canSetStatus && (
        <div className="max-w-sm">
          <ProductPicker label="Mark an item (search the color/size)…" onSelect={(p) => setEditing({ product: p, current: flags.find((f) => f.productId === p.id) || null, oldIssue: null })} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          {canSetStatus && (
            <OldIssuesList
              issues={oldIssues}
              onSetStatus={(i) => setEditing({ product: { id: i.productId, name: i.productName }, current: null, oldIssue: { id: i.id, note: i.note } })}
              onClose={(i) => closeOld(i.id)}
            />
          )}
          <SupplierFlagList
            flags={flags}
            canSetStatus={canSetStatus}
            onEdit={(f) => setEditing({ product: { id: f.productId, name: f.productName }, current: f, oldIssue: null })}
          />
        </>
      )}

      <SupplierFlagDialog
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        product={editing?.product || null}
        current={editing?.current || null}
        oldIssue={editing?.oldIssue || null}
        onSaved={reload}
      />
    </div>
  );
}
