'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AlertReviewTrailDialog } from '@/components/dashboard/inventory/alert-review-trail-dialog';
import { AlertReviewAdjustDialog } from '@/components/dashboard/inventory/alert-review-adjust-dialog';
import { AlertReviewTableRow, type AlertReviewRowItem } from '@/components/dashboard/inventory/alert-review-table-row';
import { AlertReviewKpiCards } from '@/components/dashboard/inventory/alert-review-kpi-cards';
import { AlertReviewFiltersBar } from '@/components/dashboard/inventory/alert-review-filters-bar';
import { ReservedStockDialog } from '@/components/dashboard/reserved-stock-dialog';
import { useToast } from '@/hooks/use-toast';
import { ShieldAlert, RefreshCw, CheckCircle2 } from 'lucide-react';

const ACTIVE_ORDER_STATUSES = [
  'Pending Payment',
  'Processing',
  'Waiting for Stock',
  'On-Hold',
  'Picked (with issue)'
];

export default function AlertReviewPage() {
  const [items, setItems] = useState<AlertReviewRowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'negative' | 'zero' | 'positive'>('all');
  const [rangeFilter, setRangeFilter] = useState<'recent' | 'today' | 'all'>('recent');
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'resolved' | 'all'>('pending');

  // Confirmation & bulk selection state
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Modal dialog states
  const [trailProductId, setTrailProductId] = useState<string | null>(null);
  const [trailOpen, setTrailOpen] = useState(false);
  const [selectedOrdersItem, setSelectedOrdersItem] = useState<{ id: string; name: string } | null>(null);
  const [adjustItem, setAdjustItem] = useState<AlertReviewRowItem | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const { toast } = useToast();

  const fetchAlertedItems = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/inventory/guardian/alert-review?range=${rangeFilter}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
      } else {
        throw new Error(data.error || 'Failed to load alerted items');
      }
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlertedItems();
  }, [rangeFilter]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(q) ||
        (item.variantName && item.variantName.toLowerCase().includes(q)) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.shelfLocation && item.shelfLocation.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (stockFilter === 'negative') return item.currentStock < 0;
      if (stockFilter === 'zero') return item.currentStock === 0;
      if (stockFilter === 'positive') return item.currentStock > 0;

      if (reviewStatus === 'pending') return !item.isResolved;
      if (reviewStatus === 'resolved') return !!item.isResolved;

      return true;
    });
  }, [items, searchQuery, stockFilter, reviewStatus]);

  // Metric counts
  const totalAlertsCount = useMemo(() => items.reduce((acc, i) => acc + i.alertCount, 0), [items]);
  const negativeStockCount = useMemo(() => items.filter(i => i.currentStock < 0).length, [items]);
  const pendingCount = useMemo(() => items.filter(i => !i.isResolved).length, [items]);
  const resolvedCount = useMemo(() => items.filter(i => !!i.isResolved).length, [items]);

  const handleOpenTrail = (productId: string) => {
    setTrailProductId(productId);
    setTrailOpen(true);
  };

  const handleOpenOrders = (item: AlertReviewRowItem) => {
    setSelectedOrdersItem({ id: item.productId, name: item.name });
  };

  const handleOpenAdjust = (item: AlertReviewRowItem) => {
    setAdjustItem(item);
    setAdjustOpen(true);
  };

  const handleConfirmStock = async (item: AlertReviewRowItem) => {
    setConfirmingId(item.productId);
    try {
      const res = await fetch('/api/inventory/guardian/alert-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.productId,
          actorName: 'Admin Review',
          notes: `Stock confirmed as accurate (${item.currentStock})`
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to confirm stock');

      setItems(prev => prev.map(i => {
        if (i.productId === item.productId) {
          return {
            ...i,
            isResolved: true,
            resolvedAt: new Date().toISOString(),
            resolvedBy: 'Admin Review'
          };
        }
        return i;
      }));

      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(item.productId);
        return next;
      });

      toast({
        title: 'Stock Confirmed',
        description: `Confirmed stock for "${item.name}". Removed from pending review.`
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setConfirmingId(null);
    }
  };

  const handleBulkConfirm = async () => {
    if (selectedIds.size === 0) return;
    setBulkConfirming(true);
    const ids = Array.from(selectedIds);
    try {
      const res = await fetch('/api/inventory/guardian/alert-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: ids,
          actorName: 'Admin Review'
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to confirm stocks');

      setItems(prev => prev.map(i => {
        if (selectedIds.has(i.productId)) {
          return {
            ...i,
            isResolved: true,
            resolvedAt: new Date().toISOString(),
            resolvedBy: 'Admin Review'
          };
        }
        return i;
      }));

      const count = ids.length;
      setSelectedIds(new Set());
      toast({
        title: 'Batch Confirmed',
        description: `Confirmed ${count} products. Removed from pending review.`
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setBulkConfirming(false);
    }
  };

  const handleToggleSelect = (productId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    const pendingVisible = filteredItems.filter(i => !i.isResolved).map(i => i.productId);
    const allSelected = pendingVisible.length > 0 && pendingVisible.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      pendingVisible.forEach(id => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const handleAdjustSuccess = (productId: string, newStockLevel: number, physicalCount: number, notes: string) => {
    toast({
      title: 'Stock Updated & Resolved',
      description: `Physical shelf set to ${physicalCount}. New ledger stock: ${newStockLevel}. Removed from pending review.`
    });

    setItems(prev => prev.map(i => {
      if (i.productId === productId) {
        return {
          ...i,
          currentStock: newStockLevel,
          isResolved: true,
          resolvedAt: new Date().toISOString(),
          resolvedBy: 'Admin Review',
          lastPhysicalAudit: {
            actorName: 'Admin Review',
            physicalCount,
            auditedAt: new Date().toISOString(),
            notes
          }
        };
      }
      return i;
    }));
  };

  const pendingVisibleCount = filteredItems.filter(i => !i.isResolved).length;
  const isAllVisibleSelected = pendingVisibleCount > 0 && filteredItems.filter(i => !i.isResolved).every(i => selectedIds.has(i.productId));

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Guardian Alert Review Sheet
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Purchasing-sheet style review of items alerted via Telegram. Confirm verified stock to dismiss and remove them from your active review list.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAlertedItems(true)}
            disabled={refreshing || loading}
            className="gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <AlertReviewKpiCards
        pendingCount={pendingCount}
        resolvedCount={resolvedCount}
        negativeStockCount={negativeStockCount}
        totalAlertsCount={totalAlertsCount}
      />

      {/* Sheet Table Card */}
      <Card className="shadow-sm">
        {/* Filters Toolbar */}
        <AlertReviewFiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          reviewStatus={reviewStatus}
          onReviewStatusChange={setReviewStatus}
          rangeFilter={rangeFilter}
          onRangeFilterChange={setRangeFilter}
          stockFilter={stockFilter}
          onStockFilterChange={setStockFilter}
          pendingCount={pendingCount}
          resolvedCount={resolvedCount}
          totalCount={items.length}
          negativeStockCount={negativeStockCount}
        />

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between p-3 bg-indigo-50 border-b border-indigo-100 text-xs font-medium">
            <span className="text-indigo-900 font-semibold">
              {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleBulkConfirm}
                disabled={bulkConfirming}
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${bulkConfirming ? 'animate-spin' : ''}`} />
                {bulkConfirming ? 'Confirming...' : `Confirm Stock for ${selectedIds.size} Items`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                className="h-7 text-xs"
              >
                Clear Selection
              </Button>
            </div>
          </div>
        )}

        {/* Sheet Table */}
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader className="bg-slate-50 text-slate-600">
              <TableRow>
                <th className="p-3 w-12 text-center font-bold">
                  {reviewStatus !== 'resolved' && (
                    <input
                      type="checkbox"
                      checked={isAllVisibleSelected}
                      onChange={handleSelectAllVisible}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      title="Select all visible pending products"
                    />
                  )}
                  {reviewStatus === 'resolved' && '#'}
                </th>
                <th className="p-3 text-left w-2/5">Product & SKU</th>
                <th className="p-3 text-center">Shelf</th>
                <th className="p-3 text-center">Current Inventory</th>
                <th className="p-3 text-center">Active Orders Demand</th>
                <th className="p-3 text-left">Staff Audit Status</th>
                <th className="p-3 text-center">Alert Count</th>
                <th className="p-3 text-right pr-4">Actions</th>
              </TableRow>
            </TableHeader>
            <tbody className="divide-y text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                    Loading alerted items sheet...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    {reviewStatus === 'pending'
                      ? 'No pending items to review! All alerted items have been confirmed or verified.'
                      : 'No products found matching your search.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <AlertReviewTableRow
                    key={item.productId}
                    item={item}
                    index={idx}
                    onViewOrders={handleOpenOrders}
                    onViewTrail={handleOpenTrail}
                    onOpenAdjust={handleOpenAdjust}
                    onConfirmStock={handleConfirmStock}
                    isConfirming={confirmingId === item.productId}
                    isSelected={selectedIds.has(item.productId)}
                    onToggleSelect={handleToggleSelect}
                  />
                ))
              )}
            </tbody>
          </Table>
        </div>
      </Card>

      {/* Deep Trail Dialog */}
      <AlertReviewTrailDialog
        productId={trailProductId}
        open={trailOpen}
        onOpenChange={setTrailOpen}
      />

      {/* Active Orders & Lay-aways Dialog */}
      {selectedOrdersItem && (
        <ReservedStockDialog
          productId={selectedOrdersItem.id}
          productName={selectedOrdersItem.name}
          isOpen={!!selectedOrdersItem}
          onClose={() => setSelectedOrdersItem(null)}
          statusFilter={ACTIVE_ORDER_STATUSES}
          excludeLayaway={false}
          title={`Active Orders & Lay-away for ${selectedOrdersItem.name}`}
        />
      )}

      {/* Quick Count Adjustment Dialog */}
      <AlertReviewAdjustDialog
        item={adjustItem}
        open={adjustOpen}
        onClose={() => {
          setAdjustOpen(false);
          setAdjustItem(null);
        }}
        onSuccess={handleAdjustSuccess}
      />
    </div>
  );
}
