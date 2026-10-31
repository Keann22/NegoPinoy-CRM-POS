'use client';

import { useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCustomerReturns } from '@/hooks/useCustomerReturns';
import { CustomerReturnCard, type CustomerReturnDialogKind } from '@/components/dashboard/customer-returns/customer-return-card';
import { DecideReturnDialog } from '@/components/dashboard/customer-returns/decide-return-dialog';
import { CheckReturnDialog } from '@/components/dashboard/customer-returns/check-return-dialog';
import { OutcomeDoneDialog } from '@/components/dashboard/customer-returns/outcome-done-dialog';
import { OldReturnsLog } from '@/components/dashboard/customer-returns/old-returns-log';
import { ReplacementOrderDialog } from '@/components/dashboard/customer-returns/replacement-order-dialog';
import { RefundCreditDialog } from '@/components/dashboard/customer-returns/refund-credit-dialog';
import { CR_STAGE_LABELS, type CustomerReturn, type CustomerReturnStage } from '@/types/customer-returns.types';

const TABS: CustomerReturnStage[] = ['needs_owner', 'to_check', 'to_do', 'waiting_parcel', 'done'];

const EMPTY: Record<CustomerReturnStage, string> = {
  needs_owner: 'Nothing waiting on the owners.',
  to_check: 'No returned parcels to check.',
  to_do: 'Nothing to re-ship, send or refund.',
  waiting_parcel: 'No parcels on the way back.',
  done: 'No cases closed in the last 60 days.',
};

// Customer returns: RTS parcels, damage reports and items shipped back. Cases
// are opened from an order (Orders → Process Return) or automatically by
// courier sync. See architecture.md "Planned: Customer Returns".
export default function CustomerReturnsPage() {
  const { data, isLoading, error, refresh, act } = useCustomerReturns();
  const [dialog, setDialog] = useState<{ kind: CustomerReturnDialogKind; ret: CustomerReturn } | null>(null);
  const isManagement = !!data?.isManagement;

  const groups = useMemo(() => {
    const all = data?.returns || [];
    const out = Object.fromEntries(TABS.map((t) => [t, [] as CustomerReturn[]])) as Record<CustomerReturnStage, CustomerReturn[]>;
    all.forEach((r) => out[r.stage].push(r));
    TABS.filter((t) => t !== 'done').forEach((t) =>
      out[t].sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue) || b.daysOpen - a.daysOpen));
    return out;
  }, [data]);

  const firstBusy = TABS.find((t) => t !== 'done' && groups[t].length > 0) || 'needs_owner';
  const [tab, setTab] = useState<CustomerReturnStage | null>(null);

  const dialogFor = (kind: CustomerReturnDialogKind) => (dialog?.kind === kind ? dialog.ret : null);

  return (
    <Card className="max-w-4xl mx-auto">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold font-headline">Customer Returns</h1>
            <p className="text-sm text-muted-foreground">
              Parcels sent back, damage reports and items customers ship back. Open a case from the order (Process Return).
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={refresh} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Tabs value={tab || firstBusy} onValueChange={(v) => setTab(v as CustomerReturnStage)}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start">
              {TABS.map((t) => {
                const late = groups[t].filter((r) => r.isOverdue).length;
                return (
                  <TabsTrigger key={t} value={t} className={late ? 'text-red-600' : ''}>
                    {CR_STAGE_LABELS[t]} ({groups[t].length}{late ? `, ${late} late` : ''})
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {TABS.map((t) => (
              <TabsContent key={t} value={t} className="mt-3">
                {groups[t].length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">{EMPTY[t]}</p>
                ) : (
                  <div className="space-y-2">
                    {groups[t].map((r) => (
                      <CustomerReturnCard key={r.id} ret={r} isManagement={isManagement} onAct={act}
                        onDialog={(kind, ret) => setDialog({ kind, ret })} />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

        <OldReturnsLog />
      </CardContent>

      <DecideReturnDialog ret={dialogFor('decide')} onClose={() => setDialog(null)} onSubmit={act} />
      <CheckReturnDialog ret={dialogFor('check')} onClose={() => setDialog(null)} onSubmit={act} />
      <OutcomeDoneDialog ret={dialogFor('done')} onClose={() => setDialog(null)} onSubmit={act} />
      <ReplacementOrderDialog ret={dialogFor('replacement')} onClose={() => setDialog(null)} onSubmit={act} />
      <RefundCreditDialog ret={dialogFor('money')} onClose={() => setDialog(null)} onSubmit={act} />
    </Card>
  );
}
