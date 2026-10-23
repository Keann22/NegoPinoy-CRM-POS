'use client';

import { Suspense, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';
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
import { PackedOrdersReport } from '@/components/dashboard/reports/packed-orders-report';
import { DiscrepancyReport } from '@/components/dashboard/reports/discrepancy-report';
import { ComplianceReport } from '@/components/dashboard/reports/compliance-report';
import { PurchasesReport } from '@/components/dashboard/reports/purchases-report';
import { MissingTrackingReport } from '@/components/dashboard/reports/missing-tracking-report';
import { parseDateParam, formatDateParam } from '@/lib/services/report-orders-service';

function ReportsContent() {
  const searchParams = useSearchParams();
  const { userProfile } = useUserProfile();

  const roles = useMemo(() => userProfile?.roles || [], [userProfile]);

  // Strict role flags
  const isInventory = useMemo(() => roles.includes('Inventory') && !roles.includes('Owner') && !roles.includes('Admin'), [roles]);
  const isManagement = useMemo(() => roles.includes('Owner') || roles.includes('Admin'), [roles]);
  const isSales = useMemo(() => roles.includes('Sales'), [roles]);

  // Default tab based on role
  const defaultValue = isInventory ? 'processed-orders' : 'pnl-statement';
  const initialTab = searchParams.get('tab') || defaultValue;
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Initialize shared date filter from URL parameters or current month
  const initialDate = useMemo<DateRange | undefined>(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const parsedFrom = parseDateParam(fromParam);
    const parsedTo = parseDateParam(toParam);

    if (parsedFrom) {
      // Copy so setting the end-of-day time never changes `from` when `to` is missing.
      const toObj = new Date(parsedTo || parsedFrom);
      toObj.setHours(23, 59, 59, 999);
      return { from: parsedFrom, to: toObj };
    }

    // Whole current month, so the preset dropdown shows "This Month".
    return {
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    };
  }, [searchParams]);

  const [date, setDateState] = useState<DateRange | undefined>(initialDate);

  // Sync date changes with URL without causing page reloads
  const handleDateChange = useCallback((newDate: DateRange | undefined) => {
    setDateState(newDate);
    if (newDate?.from) {
      const fromStr = formatDateParam(newDate.from);
      const toStr = newDate.to ? formatDateParam(newDate.to) : fromStr;
      const params = new URLSearchParams(window.location.search);
      params.set('from', fromStr);
      params.set('to', toStr);
      if (activeTab) params.set('tab', activeTab);
      window.history.replaceState(null, '', `?${params.toString()}`);
    }
  }, [activeTab]);

  // Sync tab changes with URL
  const handleTabChange = useCallback((newTab: string) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', newTab);
    if (date?.from) {
      params.set('from', formatDateParam(date.from));
      params.set('to', formatDateParam(date.to || date.from));
    }
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [date]);

  if (!userProfile) return <div className="p-8 text-center">Loading permissions...</div>;

  return (
    <div className="space-y-8">
      {isManagement && <SalesSummaryReport date={date} setDate={handleDateChange} />}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
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
              <TabsTrigger value="to-order">Stock Reconciliation</TabsTrigger>
            )}

            {(isManagement || isSales || isInventory) && (
              <TabsTrigger value="stale-reservations">Stale Reservations</TabsTrigger>
            )}

            {(isManagement || isInventory) && (
              <TabsTrigger value="packed">Packed Orders</TabsTrigger>
            )}

            {isManagement && (
              <TabsTrigger value="discrepancies">Auto-Adjustments</TabsTrigger>
            )}

            {/* Suppliers and purchase costs: Owner/Admin only. */}
            {isManagement && (
              <TabsTrigger value="purchases">Purchases</TabsTrigger>
            )}

            {isManagement && (
              <>
                <TabsTrigger value="layaway-report">Lay-away Balances</TabsTrigger>
                <TabsTrigger value="ar-report">Accounts Receivable</TabsTrigger>
                <TabsTrigger value="cashflow-report">Cash Flow</TabsTrigger>
              </>
            )}
            {isManagement && (
              <TabsTrigger value="compliance">Agent Compliance</TabsTrigger>
            )}
            {(isManagement || isInventory) && (
              <TabsTrigger value="missing-tracking">Missing Tracking</TabsTrigger>
            )}
          </TabsList>
        </div>

        {isManagement && (
          <TabsContent value="pnl-statement">
            <PnlReport date={date} setDate={handleDateChange} />
          </TabsContent>
        )}

        {isManagement && (
          <TabsContent value="sales">
            <SalesReport date={date} setDate={handleDateChange} />
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
          <SalesByProductReport date={date} setDate={handleDateChange} />
        </TabsContent>

        {(isManagement || isInventory) && (
          <TabsContent value="to-order">
            <ToOrderReport />
          </TabsContent>
        )}

        {isManagement && (
          <TabsContent value="discrepancies">
            <DiscrepancyReport />
          </TabsContent>
        )}

        {isManagement && (
          <TabsContent value="purchases">
            <PurchasesReport />
          </TabsContent>
        )}

        {(isManagement || isSales || isInventory) && (
          <TabsContent value="stale-reservations">
            <StaleReservationsReport />
          </TabsContent>
        )}

        {(isManagement || isInventory) && (
          <TabsContent value="packed">
            <PackedOrdersReport />
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
              <CashFlowReport date={date} setDate={handleDateChange} />
            </TabsContent>
          </>
        )}
        {isManagement && (
          <TabsContent value="compliance">
            <ComplianceReport />
          </TabsContent>
        )}
        {(isManagement || isInventory) && (
          <TabsContent value="missing-tracking">
            <MissingTrackingReport />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading reports...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
