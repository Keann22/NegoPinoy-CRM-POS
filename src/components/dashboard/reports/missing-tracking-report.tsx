'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PackageSearch } from 'lucide-react';
import type { MissingTrackingOrder } from './missing-tracking-types';
import { MissingTrackingFilters } from './missing-tracking-filters';
import { MissingTrackingTable } from './missing-tracking-table';

// Tracking numbers are only assigned once an order is dispatched, so orders
// still moving through the warehouse (Processing, Picked, Packed, Photo,
// On-Hold, For Shipping) legitimately have none yet. Only these statuses mean
// the parcel actually left.
const DISPATCHED_STATUSES = [
  'Payment Received (COD)',
  'Completed',
  'Shipped',
  'Returned',
  'For Pick-up',
];

export function MissingTrackingReport() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<MissingTrackingOrder[]>([]);
  const [scopeFilter, setScopeFilter] = useState<'dispatched' | 'all'>('dispatched');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [editingTracking, setEditingTracking] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const fetchOrders = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const PAGE_SIZE = 1000;
      const rows: any[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            order_date,
            status,
            payment_method,
            total_amount,
            amount_paid,
            balance_due,
            tracking_number,
            customers ( id, full_name )
          `)
          .or('tracking_number.is.null,tracking_number.eq.')
          .neq('status', 'Cancelled')
          .order('order_date', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }

      const filtered = rows.filter(
        (o: any) => !o.tracking_number || o.tracking_number.trim() === ''
      );

      setOrders(
        filtered.map((o: any) => ({
          id: o.id,
          shortId: o.id.substring(0, 7).toUpperCase(),
          customerName: o.customers?.full_name || 'Unknown',
          customerId: o.customers?.id || null,
          orderDate: o.order_date,
          status: o.status || 'Unknown',
          paymentMethod: o.payment_method || 'COD',
          totalAmount: o.total_amount || 0,
          amountPaid: o.amount_paid || 0,
          balanceDue: o.balance_due || 0,
        }))
      );
    } catch (err: unknown) {
      console.error('Failed to fetch orders without tracking', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const scopedOrders = useMemo(
    () =>
      scopeFilter === 'all'
        ? orders
        : orders.filter((o) => DISPATCHED_STATUSES.includes(o.status)),
    [orders, scopeFilter]
  );

  const hiddenCount = orders.length - scopedOrders.length;

  const statusOptions = useMemo(
    () => Array.from(new Set(scopedOrders.map((o) => o.status))).sort(),
    [scopedOrders]
  );
  const paymentOptions = useMemo(
    () => Array.from(new Set(scopedOrders.map((o) => o.paymentMethod))).sort(),
    [scopedOrders]
  );

  const filteredOrders = useMemo(() => {
    return scopedOrders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && o.paymentMethod !== paymentFilter) return false;
      return true;
    });
  }, [scopedOrders, statusFilter, paymentFilter]);

  const handleSave = async (orderId: string) => {
    const trackingValue = editingTracking[orderId]?.trim();
    if (!trackingValue || !supabase) return;

    setSavingIds((prev) => new Set(prev).add(orderId));
    try {
      const { error } = await supabase
        .from('orders')
        .update({ tracking_number: trackingValue })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Tracking Updated',
        description: `Tracking number saved for Order #${orderId.substring(0, 7).toUpperCase()}.`,
      });

      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setEditingTracking((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: message,
      });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PackageSearch className="h-5 w-5" />
              Missing Tracking Numbers
            </CardTitle>
            <CardDescription>
              {scopeFilter === 'dispatched'
                ? 'Dispatched orders that left without a tracking number recorded. You can update tracking numbers directly from this table.'
                : 'Every open order with no tracking number, including ones still in the warehouse that are not expected to have one yet. Cancelled orders are excluded.'}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className="text-sm px-3 py-1">
              {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
            </Badge>
            {scopeFilter === 'dispatched' && hiddenCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {hiddenCount} not yet dispatched, hidden
              </span>
            )}
          </div>
        </div>
        
        <MissingTrackingFilters
          scopeFilter={scopeFilter}
          setScopeFilter={setScopeFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          paymentFilter={paymentFilter}
          setPaymentFilter={setPaymentFilter}
          statusOptions={statusOptions}
          paymentOptions={paymentOptions}
        />
      </CardHeader>
      
      <CardContent>
        <MissingTrackingTable
          loading={loading}
          filteredOrders={filteredOrders}
          scopeFilter={scopeFilter}
          hiddenCount={hiddenCount}
          editingTracking={editingTracking}
          setEditingTracking={setEditingTracking}
          savingIds={savingIds}
          handleSave={handleSave}
        />
      </CardContent>
    </Card>
  );
}
