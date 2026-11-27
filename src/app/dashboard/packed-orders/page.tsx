'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RevertPendingDialog } from '@/components/dashboard/revert-pending-dialog';
import { ShipHoldDialog } from '@/components/dashboard/ship-holds/ship-hold-dialog';
import { VerifyShippingDialog } from '@/components/dashboard/verify-shipping-dialog';
import { CancelOrderDialog, type CancelOrderTarget } from '@/components/dashboard/orders/cancel-order-dialog';
import { PackedOrderRow } from '@/components/dashboard/packed-orders/packed-order-row';
import { AssignTaskDialog, type TaskOrderRef } from '@/components/dashboard/tasks/assign-task-dialog';
import { usePackedOrders, type PackedOrderRowData } from '@/hooks/usePackedOrders';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import type { Order } from '@/types';

export default function PackedOrdersPage() {
  const { orders: rawOrders, isLoading, refetch } = usePackedOrders();
  const { isManagement, isSales } = useRoleCheck();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterSalesPerson, setFilterSalesPerson] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [activeTab, setActiveTab] = useState('ready');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterSalesPerson, activeTab]);

  const [verifyOrder, setVerifyOrder] = useState<Order | null>(null);
  const [notForShippingOrder, setNotForShippingOrder] = useState<Order | null>(null);
  const [revertOrder, setRevertOrder] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelOrderTarget | null>(null);
  const [askSalesTarget, setAskSalesTarget] = useState<{
    order: TaskOrderRef;
    assigneeName: string | null;
    defaultMessage: string;
  } | null>(null);

  const formattedOrders: PackedOrderRowData[] = useMemo(() => {
    let filtered = rawOrders;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((o) =>
        (o.id || '').toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)
      );
    }
    if (filterSalesPerson !== 'All') {
      filtered = filtered.filter((o) => o.salesPersonName === filterSalesPerson);
    }
    return filtered;
  }, [rawOrders, searchQuery, filterSalesPerson]);

  const uniqueSalesPersons = useMemo(
    () => Array.from(new Set(rawOrders.map((o) => o.salesPersonName).filter(Boolean))).sort() as string[],
    [rawOrders]
  );

  const readyOrders = formattedOrders.filter((o) => !o.not_for_shipping_reason);
  const waitingOrders = formattedOrders.filter((o) => !!o.not_for_shipping_reason);

  const currentOrders = activeTab === 'ready' ? readyOrders : waitingOrders;
  const totalPages = Math.max(1, Math.ceil(currentOrders.length / rowsPerPage));
  const paginatedData = currentOrders.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleOpenAskSales = (order: PackedOrderRowData) => {
    const short = `#${order.id.slice(0, 7).toUpperCase()}`;
    const paidPart = Number(order.amountPaid || 0) <= 0.009 ? ', ₱0 paid' : '';
    setAskSalesTarget({
      order: { id: order.id, label: `${short} · ${order.customerName}` },
      assigneeName: order.salesPersonName || null,
      defaultMessage: `Please check with customer: ship or cancel? (Packed ${order.daysPacked} days ago${paidPart})`,
    });
  };

  const handleOpenCancel = (order: PackedOrderRowData) => {
    setCancelTarget({
      id: order.id,
      customerName: order.customerName,
      status: order.orderStatus,
      amountPaid: order.amountPaid,
      totalAmount: order.totalAmount,
    });
  };

  const renderTable = (ordersToRender: PackedOrderRowData[], isWaitingTab: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order ID</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Sales Rep</TableHead>
          <TableHead>Order Date</TableHead>
          <TableHead>Packed Date</TableHead>
          {isWaitingTab && <TableHead>Reason</TableHead>}
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            {isWaitingTab && <TableCell><Skeleton className="h-4 w-48" /></TableCell>}
            <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
          </TableRow>
        ))}
        {!isLoading && ordersToRender.length === 0 && (
          <TableRow>
            <TableCell colSpan={isWaitingTab ? 7 : 6} className="text-center py-12 text-muted-foreground">
              No orders found in this category.
            </TableCell>
          </TableRow>
        )}
        {!isLoading && ordersToRender.map((order) => (
          <PackedOrderRow
            key={order.id}
            order={order}
            isWaitingTab={isWaitingTab}
            canCancel={isSales}
            canAskSales={isManagement}
            onRevert={setRevertOrder}
            onHold={setNotForShippingOrder}
            onVerify={setVerifyOrder}
            onCancel={handleOpenCancel}
            onAskSales={handleOpenAskSales}
          />
        ))}
      </TableBody>
    </Table>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <CardTitle className="font-headline">Packed Orders</CardTitle>
              <CardDescription>
                Review freshly packed orders, verify their shipping details, and send them to the &quot;For Shipping&quot; queue.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search order ID or customer..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterSalesPerson} onValueChange={setFilterSalesPerson}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Sales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Sales Reps</SelectItem>
                {uniqueSalesPersons.map((sp) => (
                  <SelectItem key={sp} value={sp}>{sp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="ready">
                Ready to Verify <Badge variant="secondary" className="ml-2 bg-background">{readyOrders.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="waiting">
                Waiting to be Shipped <Badge variant="secondary" className="ml-2 bg-background">{waitingOrders.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ready">{renderTable(paginatedData, false)}</TabsContent>
            <TabsContent value="waiting">{renderTable(paginatedData, true)}</TabsContent>
          </Tabs>
        </CardContent>
        {currentOrders.length > 0 && (
          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
            <div className="text-sm text-muted-foreground">
              Showing <strong>{(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, currentOrders.length)}</strong> of <strong>{currentOrders.length}</strong> orders
            </div>
            <div className="flex items-center gap-2">
              <Select value={rowsPerPage.toString()} onValueChange={(val) => { setRowsPerPage(Number(val)); setCurrentPage(1); }}>
                <SelectTrigger className="w-[70px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center border rounded-md h-9 px-1">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                <span className="text-sm mx-2 min-w-[3rem] text-center">{currentPage} / {totalPages}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      <VerifyShippingDialog
        order={verifyOrder}
        open={!!verifyOrder}
        onOpenChange={(open) => !open && setVerifyOrder(null)}
        onSuccess={refetch}
      />
      <ShipHoldDialog
        orderId={notForShippingOrder?.id || null}
        open={!!notForShippingOrder}
        onOpenChange={(open) => !open && setNotForShippingOrder(null)}
        onSaved={refetch}
      />
      <RevertPendingDialog
        order={revertOrder}
        open={!!revertOrder}
        onOpenChange={(open) => !open && setRevertOrder(null)}
        onSuccess={refetch}
      />
      <CancelOrderDialog
        order={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        source="packed orders"
        onCancelled={() => refetch()}
      />
      <AssignTaskDialog
        open={!!askSalesTarget}
        onOpenChange={(open) => !open && setAskSalesTarget(null)}
        order={askSalesTarget?.order || null}
        defaultAssigneeName={askSalesTarget?.assigneeName || null}
        defaultMessage={askSalesTarget?.defaultMessage || ''}
        onCreated={refetch}
      />
    </>
  );
}
