'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProcessedOrdersReport } from '@/app/dashboard/reports/processed-orders-report';
import { SalesReport } from '@/app/dashboard/reports/sales-report';
import { PnlReport } from '@/app/dashboard/reports/pnl-report';
import { LayawayReport } from '@/app/dashboard/reports/layaway-report';
import { CashFlowReport } from '@/app/dashboard/reports/cashflow-report';
import { AccountsReceivableReport } from '@/app/dashboard/reports/ar-report';
import { useUserProfile } from '@/hooks/useUserProfile';
import { SalesByProductReport } from '@/components/dashboard/reports/sales-by-product-report';
import { ToOrderReport } from '@/components/dashboard/reports/to-order-report';
import { SalesSummaryReport } from '@/components/dashboard/reports/sales-summary-report';
import { CommissionReport } from '@/components/dashboard/reports/commission-report';
import { StaleReservationsReport } from '@/components/dashboard/reports/stale-reservations-report';
import { useMemo } from 'react';

export default function ReportsPage() {
  const { userProfile } = useUserProfile();
  
  const roles = useMemo(() => userProfile?.roles || [], [userProfile]);
  
  // Strict role flags
  const isInventory = useMemo(() => roles.includes('Inventory') && !roles.includes('Owner') && !roles.includes('Admin'), [roles]);
  const isManagement = useMemo(() => roles.includes('Owner') || roles.includes('Admin'), [roles]);
  const isSales = useMemo(() => roles.includes('Sales'), [roles]);

  // Default tab based on role
  const defaultValue = isInventory ? "processed-orders" : "pnl-statement";

  if (!userProfile) return <div className="p-8 text-center">Loading permissions...</div>;

  return (
    <div className="space-y-8">
      {isManagement && <SalesSummaryReport />}
      
      <Tabs defaultValue={defaultValue} className="space-y-4">
        <div className="flex items-center justify-between">
        <TabsList className="flex-wrap h-auto">
          {isManagement && <TabsTrigger value="pnl-statement">P&L Statement</TabsTrigger>}
          {isManagement && <TabsTrigger value="sales">Sales by Person</TabsTrigger>}
          {(isManagement || isSales) && <TabsTrigger value="commissions">Commissions</TabsTrigger>}
          
          {(isManagement || isSales || isInventory) && (
            <TabsTrigger value="processed-orders">Processed Orders (Printing)</TabsTrigger>
          )}
          
          <TabsTrigger value="sales-product">Sales by Product</TabsTrigger>
          {(isManagement || isInventory) && (
            <TabsTrigger value="to-order">To Order (Procurement)</TabsTrigger>
          )}
          
          {(isManagement || isSales || isInventory) && (
            <TabsTrigger value="stale-reservations">Stale Reservations</TabsTrigger>
          )}
          
          {isManagement && (
            <>
                <TabsTrigger value="layaway-report">Lay-away Balances</TabsTrigger>
                <TabsTrigger value="ar-report">Accounts Receivable</TabsTrigger>
                <TabsTrigger value="cashflow-report">Cash Flow</TabsTrigger>
            </>
          )}
        </TabsList>
      </div>
      
      {isManagement && (
        <TabsContent value="pnl-statement">
            <PnlReport />
        </TabsContent>
      )}
      
      {isManagement && (
        <TabsContent value="sales">
            <SalesReport />
        </TabsContent>
      )}

      {(isManagement || isSales) && (
        <TabsContent value="commissions">
            <CommissionReport />
        </TabsContent>
      )}

      {(isManagement || isSales || isInventory) && (
        <TabsContent value="processed-orders">
            <ProcessedOrdersReport />
        </TabsContent>
      )}

      <TabsContent value="sales-product">
        <SalesByProductReport />
      </TabsContent>

      {(isManagement || isInventory) && (
        <TabsContent value="to-order">
          <ToOrderReport />
        </TabsContent>
      )}

      {(isManagement || isSales || isInventory) && (
        <TabsContent value="stale-reservations">
          <StaleReservationsReport />
        </TabsContent>
      )}

      {isManagement && (
        <>
            <TabsContent value="layaway-report">
                <LayawayReport />
            </TabsContent>

            <TabsContent value="ar-report">
                <AccountsReceivableReport />
            </TabsContent>

            <TabsContent value="cashflow-report">
                <CashFlowReport />
            </TabsContent>
        </>
      )}
    </Tabs>
    </div>
  );
}
