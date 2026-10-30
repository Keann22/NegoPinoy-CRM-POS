'use client';

import { useMemo, useState } from 'react';
import { Loader2, PackageX, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSupplierReturns } from '@/hooks/useSupplierReturns';
import { ReportDamagedDialog } from '@/components/dashboard/supplier-returns/report-damaged-dialog';
import { ReturnActionDialog, type ReturnDialogKind } from '@/components/dashboard/supplier-returns/return-action-dialog';
import { SupplierReturnCard } from '@/components/dashboard/supplier-returns/supplier-return-card';
import { SupplierOwedSummary } from '@/components/dashboard/supplier-returns/supplier-owed-summary';
import type { SupplierReturn } from '@/types/supplier-returns.types';

// Bad items set aside to return to suppliers, what's with the supplier, and
// what came back. Everyone in inventory sees it; supplier names and costs are
// stripped by the API for anyone who isn't an owner.
export default function SupplierReturnsPage() {
  const { data, isLoading, error, refresh, act, setSupplierDays } = useSupplierReturns();
  const [reporting, setReporting] = useState(false);
  const [dialog, setDialog] = useState<{ kind: ReturnDialogKind; ret: SupplierReturn } | null>(null);

  const groups = useMemo(() => {
    const all = data?.returns || [];
    const byUrgency = (a: SupplierReturn, b: SupplierReturn) =>
      Number(b.isOverdue) - Number(a.isOverdue) || Number(b.customerWaiting) - Number(a.customerWaiting) || b.daysWaiting - a.daysWaiting;
    return {
      toReturn: all.filter((r) => r.status === 'to_return').sort(byUrgency),
      waiting: all.filter((r) => r.status === 'with_supplier').sort(byUrgency),
      done: all.filter((r) => r.status === 'closed'),
    };
  }, [data]);

  const isManagement = !!data?.isManagement;
  const overdue = groups.waiting.filter((r) => r.isOverdue).length;

  const list = (items: SupplierReturn[], empty: string) =>
    items.length === 0 ? (
      <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>
    ) : (
      <div className="space-y-2">
        {items.map((r) => (
          <SupplierReturnCard key={r.id} ret={r} isManagement={isManagement} onAction={(kind, ret) => setDialog({ kind, ret })} />
        ))}
      </div>
    );

  return (
    <Card className="max-w-4xl mx-auto">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold font-headline">Supplier Returns</h1>
            <p className="text-sm text-muted-foreground">
              Damaged items to bring back, what the suppliers still owe, and what came back.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={refresh} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={() => setReporting(true)}><PackageX className="mr-2 h-4 w-4" />Report damaged</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            {isManagement && data && (
              <SupplierOwedSummary returns={data.returns} suppliers={data.suppliers} onSetDays={setSupplierDays} />
            )}
            <Tabs defaultValue={groups.waiting.length > 0 && groups.toReturn.length === 0 ? 'waiting' : 'to_return'}>
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="to_return">To return ({groups.toReturn.length})</TabsTrigger>
                <TabsTrigger value="waiting" className={overdue ? 'text-red-600' : ''}>
                  Waiting ({groups.waiting.length}{overdue ? `, ${overdue} late` : ''})
                </TabsTrigger>
                <TabsTrigger value="done">Done ({groups.done.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="to_return" className="mt-3">
                {list(groups.toReturn, 'Nothing set aside. Use "Report damaged" when you find a bad item.')}
              </TabsContent>
              <TabsContent value="waiting" className="mt-3">
                {list(groups.waiting, 'Nothing is waiting on a supplier.')}
              </TabsContent>
              <TabsContent value="done" className="mt-3">
                {list(groups.done, 'No returns closed in the last 60 days.')}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>

      <ReportDamagedDialog open={reporting} onClose={() => setReporting(false)} onReported={refresh} />
      <ReturnActionDialog
        kind={dialog?.kind ?? null}
        ret={dialog?.ret ?? null}
        suppliers={data?.suppliers || []}
        onClose={() => setDialog(null)}
        onSubmit={act}
      />
    </Card>
  );
}
