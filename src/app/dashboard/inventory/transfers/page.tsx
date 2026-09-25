'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRightLeft, ListChecks, History } from 'lucide-react';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { ReplenishmentTable } from '@/components/dashboard/inventory/transfers/replenishment-table';
import { QuickTransfer } from '@/components/dashboard/inventory/transfers/quick-transfer';
import { TransferHistory } from '@/components/dashboard/inventory/transfers/transfer-history';
import { Badge } from '@/components/ui/badge';

export default function StockTransfersPage() {
  const {
    warehouses,
    transfers,
    suggestions,
    loading,
    isTransferring,
    transferStock,
    refreshSuggestions,
  } = useWarehouseStock();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Internal Stock Transfers</h1>
          <p className="text-muted-foreground text-sm">
            Manage replenishment between Unit 2 (Reserve & Inbound) and Unit 1 (Fulfillment Hub).
          </p>
        </div>
      </div>

      <Tabs defaultValue="replenishment" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="replenishment" className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            <span>Runner Sheet</span>
            {suggestions.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4">
                {suggestions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="quick-transfer" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            <span>Quick Transfer</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span>History</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="replenishment" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <ReplenishmentTable
                suggestions={suggestions}
                warehouses={warehouses}
                loading={loading}
                onTransfer={transferStock}
                onRefresh={refreshSuggestions}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quick-transfer" className="space-y-4">
          <QuickTransfer
            warehouses={warehouses}
            isTransferring={isTransferring}
            onTransfer={transferStock}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Transfer History</CardTitle>
              <CardDescription>
                Recent movements between Unit 1 and Unit 2 storage units.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TransferHistory transfers={transfers} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
