'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { endOfDay, format, isValid } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useSupabase } from '@/lib/supabase/hooks';

import { AddOrderDialog } from '@/components/dashboard/order-dialog';
import { LogPaymentDialog } from '@/components/dashboard/log-payment-dialog';
import { CompleteCodPaymentDialog } from '@/components/dashboard/complete-cod-payment-dialog';
import { EditPaymentTermsDialog } from '@/components/dashboard/edit-payment-terms-dialog';
import { SetDueDateDialog } from '@/components/dashboard/set-due-date-dialog';
import { MarkShippedDialog } from '@/components/dashboard/mark-shipped-dialog';
import { WaybillSummaryDialog } from '@/components/dashboard/waybill-summary-dialog';
import { OnHoldReasonDialog } from '@/components/dashboard/on-hold-reason-dialog';
import { ProcessReturnDialog } from '@/components/dashboard/process-return-dialog';

import { OrdersFilterBar } from '@/components/dashboard/orders/OrdersFilterBar';
import { OrdersTable } from '@/components/dashboard/orders/OrdersTable';
import { useOrders } from '@/hooks/useOrders';
import { restoreStockForCancelledOrder, deductStockForUncancelledOrder, resolveOpenOrderIssues, STATUSES_THAT_CLEAR_ORDER_ISSUES } from '@/lib/services/order-service';

import type { FormattedOrder, Order, OrderStatus } from '@/types';
import { ORDER_STATUSES } from '@/types';

// Re-export for files that import Order from this page during transition
export type { Order } from '@/types';

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();

  // ── Domain hook ────────────────────────────────────────────────────────────
  const { orders, customerMap, isLoading, refetch } = useOrders();

  // ── Role gates ─────────────────────────────────────────────────────────────
  const isInventoryOnly = !!(userProfile?.roles.includes('Inventory') && !userProfile?.roles.includes('Sales') && !userProfile?.roles.includes('Admin') && !userProfile?.roles.includes('Owner'));
  const canCreateOrder = !!(userProfile?.roles.some(r => ['Sales', 'Admin', 'Owner'].includes(r)));
  const isAdminOrOwner = !!(userProfile?.roles.some(r => ['Admin', 'Owner'].includes(r)));
  const canSyncCourier = !!(userProfile?.roles?.some(r => ['Admin', 'Owner', 'Inventory'].includes(r)));

  // ── Dialog state ───────────────────────────────────────────────────────────
  const [logPaymentOrder, setLogPaymentOrder] = useState<Order | null>(null);
  const [codPaymentOrder, setCodPaymentOrder] = useState<Order | null>(null);
  const [editPaymentOrder, setEditPaymentOrder] = useState<Order | null>(null);
  const [dueDateOrder, setDueDateOrder] = useState<Order | null>(null);
  const [markShippedOrder, setMarkShippedOrder] = useState<Order | null>(null);
  const [viewWaybillOrder, setViewWaybillOrder] = useState<Order | null>(null);
  const [onHoldOrder, setOnHoldOrder] = useState<Order | null>(null);
  const [processReturnOrder, setProcessReturnOrder] = useState<Order | null>(null);

  // ── Filter/selection state ─────────────────────────────────────────────────
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState(searchParams?.get('search') || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // ── Derived: filtered + formatted orders ───────────────────────────────────
  const formattedOrders: FormattedOrder[] = useMemo(() => {
    if (!orders) return [];
    let filtered = [...orders];
    if (statusFilter !== 'all') filtered = filtered.filter(o => o.orderStatus === statusFilter);
    if (typeFilter !== 'all') filtered = filtered.filter(o => o.paymentType === typeFilter);
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim().replace(/\s+/g, ' ');
      filtered = filtered.filter(o =>
        (o.id || '').toLowerCase().includes(query) ||
        (customerMap.get(o.customerId) || '').toLowerCase().replace(/\s+/g, ' ').includes(query)
      );
    }
    if (date?.from) {
      const fromTime = date.from.getTime();
      const toTime = date.to ? endOfDay(date.to).getTime() : endOfDay(date.from).getTime();
      filtered = filtered.filter(o => {
        const t = new Date(o.orderDate).getTime();
        return t >= fromTime && t <= toTime;
      });
    }
    const sorted = filtered.sort((a, b) => {
      const aPending = ['Pending Payment', 'Processing'].includes(a.orderStatus) ? 0 : 1;
      const bPending = ['Pending Payment', 'Processing'].includes(b.orderStatus) ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      const timeA = new Date(a.orderDate).getTime();
      const timeB = new Date(b.orderDate).getTime();
      return aPending === 0 ? timeA - timeB : timeB - timeA;
    });
    return sorted.map(order => {
      const d = order.orderDate ? new Date(order.orderDate) : null;
      return {
        ...order,
        customerName: customerMap.get(order.customerId) || 'Unknown Customer',
        formattedDate: d && isValid(d) ? format(d, 'PPP') : 'Unknown Date',
        formattedTotal: `₱${(Number(order.totalAmount) || 0).toFixed(2)}`,
      };
    });
  }, [orders, customerMap, date, statusFilter, typeFilter, searchQuery]);

  const totalPages = Math.ceil((formattedOrders?.length || 0) / rowsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return formattedOrders.slice(startIndex, startIndex + rowsPerPage);
  }, [formattedOrders, currentPage, rowsPerPage]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  /**
   * Applies the stock side-effect (if any) for a status transition, then updates the order row.
   * Cancelling restores previously-deducted stock; un-cancelling re-deducts it, since stock
   * is taken out immediately at order creation rather than at pick/pack/ship.
   */
  const applyOrderStatusChange = async (orderId: string, currentStatus: OrderStatus | undefined, newStatus: OrderStatus) => {
    if (!supabase || currentStatus === newStatus) return;

    if (newStatus === 'Cancelled' && currentStatus !== 'Cancelled') {
      await restoreStockForCancelledOrder(supabase, orderId);
    } else if (currentStatus === 'Cancelled' && newStatus !== 'Cancelled') {
      await deductStockForUncancelledOrder(supabase, orderId);
    }

    const updatePayload: any = { status: newStatus };
    if (['Shipped', 'Completed', 'Payment Received (COD)'].includes(newStatus)) {
      updatePayload.completed_at = new Date().toISOString();
    } else {
      updatePayload.completed_at = null;
    }
    const { error } = await supabase.from('orders').update(updatePayload).eq('id', orderId);
    if (error) throw error;

    if (STATUSES_THAT_CLEAR_ORDER_ISSUES.includes(newStatus)) {
      await resolveOpenOrderIssues(supabase, orderId);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (!supabase) return;
    try {
      const currentStatus = orders?.find(o => o.id === orderId)?.orderStatus;
      await applyOrderStatusChange(orderId, currentStatus, newStatus);
      toast({ title: 'Order Status Updated', description: `Order has been set to "${newStatus}".` });
      refetch();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    }
  };

  const handleBulkStatusChange = async (newStatus: OrderStatus) => {
    if (!supabase || selectedOrderIds.length === 0) return;
    if (newStatus === 'Returned') {
      toast({ variant: 'destructive', title: 'Cannot bulk-return', description: 'Process returns individually so the item, quantity, and reason can be captured.' });
      return;
    }
    try {
      for (const orderId of selectedOrderIds) {
        const currentStatus = orders?.find(o => o.id === orderId)?.orderStatus;
        await applyOrderStatusChange(orderId, currentStatus, newStatus);
      }
      toast({ title: 'Bulk Update Successful', description: `${selectedOrderIds.length} orders updated to "${newStatus}".` });
      setSelectedOrderIds([]);
      refetch();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    }
  };

  return (
    <>
      <OnHoldReasonDialog
        open={!!onHoldOrder}
        onOpenChange={(open) => !open && setOnHoldOrder(null)}
        order={onHoldOrder}
        onSuccess={() => refetch()}
      />

      <ProcessReturnDialog
        open={!!processReturnOrder}
        onOpenChange={(open) => !open && setProcessReturnOrder(null)}
        order={processReturnOrder}
        onSuccess={() => refetch()}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
           <div>
             <CardTitle className="font-headline">Orders</CardTitle>
             <CardDescription>View and manage customer sales orders.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {canSyncCourier && (
              <Button variant="outline" onClick={() => router.push('/dashboard/orders/courier-sync')}>
                <Upload className="mr-2 h-4 w-4" /> Courier Sync
              </Button>
            )}
            {canCreateOrder && <AddOrderDialog onOrderAdded={refetch} />}
          </div>
        </CardHeader>
        <CardContent>
          <OrdersFilterBar
            searchQuery={searchQuery} onSearchChange={(q) => { setSearchQuery(q); setCurrentPage(1); }}
            statusFilter={statusFilter} onStatusChange={(s) => { setStatusFilter(s); setCurrentPage(1); }}
            typeFilter={typeFilter} onTypeChange={(t) => { setTypeFilter(t); setCurrentPage(1); }}
            date={date} onDateChange={(d) => { setDate(d); setCurrentPage(1); }}
            selectedOrderIds={selectedOrderIds} onBulkStatusChange={handleBulkStatusChange}
          />
          <OrdersTable
            orders={paginatedOrders}
            isLoading={isLoading}
            selectedOrderIds={selectedOrderIds}
            onSelectAll={(checked) => {
              if (checked) {
                const newSel = new Set([...selectedOrderIds, ...paginatedOrders.map(o => o.id)]);
                setSelectedOrderIds(Array.from(newSel));
              } else {
                const visible = new Set(paginatedOrders.map(o => o.id));
                setSelectedOrderIds(selectedOrderIds.filter(id => !visible.has(id)));
              }
            }}
            onSelectOne={(id, checked) =>
              setSelectedOrderIds(prev => checked ? [...prev, id] : prev.filter(x => x !== id))
            }
            onViewDetails={(order) => router.push(`/dashboard/orders/${order.id}`)}
            onLogPayment={setLogPaymentOrder}
            onEditPaymentTerms={setEditPaymentOrder}
            onMarkShipped={setMarkShippedOrder}
            onViewWaybill={setViewWaybillOrder}
            onCodPayment={setCodPaymentOrder}
            onDueDate={setDueDateOrder}
            onStatusChange={(id, newStatus) => {
              if (newStatus === 'On-Hold') {
                const order = orders?.find(o => o.id === id);
                if (order) setOnHoldOrder(order);
              } else if (newStatus === 'Returned') {
                const order = orders?.find(o => o.id === id);
                if (order) setProcessReturnOrder(order);
              } else {
                handleStatusChange(id, newStatus);
              }
            }}
            onProcessReturn={setProcessReturnOrder}
            isInventoryOnly={isInventoryOnly}
            canCreateOrder={canCreateOrder}
            isAdminOrOwner={isAdminOrOwner}
            userRoles={userProfile?.roles ?? []}
          />
          {!isLoading && (!formattedOrders || formattedOrders.length === 0) && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
              <p className="text-lg font-semibold">No orders found</p>
              <p className="text-muted-foreground mt-2">
                {canCreateOrder ? 'Click "New Order" to get started.' : 'No orders matched your criteria.'}
              </p>
            </div>
          )}
        </CardContent>
        {formattedOrders && formattedOrders.length > 0 && (
          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
            <div className="text-sm text-muted-foreground">
              Showing <strong>{(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, formattedOrders.length)}</strong> of <strong>{formattedOrders.length}</strong> orders
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
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                <span className="text-sm mx-2 min-w-[3rem] text-center">{currentPage} / {totalPages}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      {logPaymentOrder && (
        <LogPaymentDialog order={logPaymentOrder} open={!!logPaymentOrder} onOpenChange={(isOpen) => !isOpen && setLogPaymentOrder(null)} />
      )}
      <CompleteCodPaymentDialog order={codPaymentOrder} open={!!codPaymentOrder} onOpenChange={(open) => !open && setCodPaymentOrder(null)} onSuccess={() => { refetch(); setCodPaymentOrder(null); }} />
      <EditPaymentTermsDialog order={editPaymentOrder} open={!!editPaymentOrder} onOpenChange={(open) => !open && setEditPaymentOrder(null)} onSuccess={() => { refetch(); setEditPaymentOrder(null); }} />
      {dueDateOrder && (
        <SetDueDateDialog open={!!dueDateOrder} onOpenChange={(open) => !open && setDueDateOrder(null)} orderId={dueDateOrder.id} onSuccess={() => { refetch(); setDueDateOrder(null); }} />
      )}
      {markShippedOrder && (
        <MarkShippedDialog open={!!markShippedOrder} onOpenChange={(isOpen) => { if (!isOpen) setMarkShippedOrder(null); }} orderId={markShippedOrder.id} currentTrackingNumber={markShippedOrder.tracking_number || ''} onSuccess={() => { refetch(); setMarkShippedOrder(null); }} />
      )}
      {viewWaybillOrder && (
        <WaybillSummaryDialog open={!!viewWaybillOrder} onOpenChange={(isOpen) => { if (!isOpen) setViewWaybillOrder(null); }} order={viewWaybillOrder} />
      )}
    </>
  );
}
