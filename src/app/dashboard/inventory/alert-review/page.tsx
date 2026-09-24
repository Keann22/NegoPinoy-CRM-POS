'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertReviewTrailDialog } from '@/components/dashboard/inventory/alert-review-trail-dialog';
import { AlertReviewAdjustDialog } from '@/components/dashboard/inventory/alert-review-adjust-dialog';
import { AlertReviewTableRow, type AlertReviewRowItem } from '@/components/dashboard/inventory/alert-review-table-row';
import { ReservedStockDialog } from '@/components/dashboard/reserved-stock-dialog';
import { useToast } from '@/hooks/use-toast';
import { ShieldAlert, Search, RefreshCw } from 'lucide-react';

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

  // Trail dialog state
  const [trailProductId, setTrailProductId] = useState<string | null>(null);
  const [trailOpen, setTrailOpen] = useState(false);

  // Active Orders (including Lay-aways) dialog state
  const [selectedOrdersItem, setSelectedOrdersItem] = useState<{ id: string; name: string } | null>(null);

  // Quick physical count correction modal state
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
      return true;
    });
  }, [items, searchQuery, stockFilter]);

  // Metric counts
  const totalAlertsCount = useMemo(() => items.reduce((acc, i) => acc + i.alertCount, 0), [items]);
  const negativeStockCount = useMemo(() => items.filter(i => i.currentStock < 0).length, [items]);
  const auditedCount = useMemo(() => items.filter(i => !!i.lastPhysicalAudit).length, [items]);

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

  const handleAdjustSuccess = (productId: string, newStockLevel: number, physicalCount: number, notes: string) => {
    toast({
      title: 'Stock Updated',
      description: `Physical shelf set to ${physicalCount}. New ledger stock: ${newStockLevel}.`
    });

    setItems(prev => prev.map(i => {
      if (i.productId === productId) {
        return {
          ...i,
          currentStock: newStockLevel,
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
            Purchasing-sheet style review of all items alerted via Telegram since yesterday. Click any demand count to see all active orders (including Lay-aways) and their statuses.
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-medium">Alerted Products</CardDescription>
            <CardTitle className="text-2xl font-extrabold text-slate-800">{items.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 text-[11px] text-muted-foreground">
            Unique items notified to Telegram
          </CardContent>
        </Card>

        <Card className="shadow-sm border-rose-200 bg-rose-50/30">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-medium text-rose-700">Negative Stock Items</CardDescription>
            <CardTitle className="text-2xl font-extrabold text-rose-700">{negativeStockCount}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 text-[11px] text-rose-600">
            Items currently below 0 in ledger
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-medium">Total Messages Sent</CardDescription>
            <CardTitle className="text-2xl font-extrabold text-indigo-600">{totalAlertsCount}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 text-[11px] text-muted-foreground">
            Telegram push alerts dispatched
          </CardContent>
        </Card>

        <Card className="shadow-sm border-emerald-200 bg-emerald-50/30">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-medium text-emerald-700">Physically Audited</CardDescription>
            <CardTitle className="text-2xl font-extrabold text-emerald-700">{auditedCount}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 text-[11px] text-emerald-600">
            Count confirmed by staff
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search Toolbar */}
      <Card className="shadow-sm">
        <div className="p-4 border-b bg-slate-50 flex flex-col md:flex-row justify-between md:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search product name, SKU, shelf..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Range Toggle */}
            <div className="inline-flex rounded-md border bg-white p-0.5 text-xs">
              {(['recent', 'today', 'all'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRangeFilter(r)}
                  className={`px-3 py-1 rounded font-medium transition-colors ${
                    rangeFilter === r ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {r === 'recent' ? 'Since Yesterday' : r === 'today' ? 'Today Only' : 'All Time'}
                </button>
              ))}
            </div>

            {/* Stock Filter */}
            <div className="inline-flex rounded-md border bg-white p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStockFilter('all')}
                className={`px-2.5 py-1 rounded font-medium ${stockFilter === 'all' ? 'bg-slate-200 text-slate-900' : 'text-slate-600'}`}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('negative')}
                className={`px-2.5 py-1 rounded font-medium ${stockFilter === 'negative' ? 'bg-rose-100 text-rose-800' : 'text-slate-600'}`}
              >
                Negative ({negativeStockCount})
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('zero')}
                className={`px-2.5 py-1 rounded font-medium ${stockFilter === 'zero' ? 'bg-amber-100 text-amber-800' : 'text-slate-600'}`}
              >
                Zero
              </button>
            </div>
          </div>
        </div>

        {/* Sheet Table */}
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader className="bg-slate-50 text-slate-600">
              <TableRow>
                <th className="p-3 w-10 text-center font-bold">#</th>
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
                    No alerted products found matching your search.
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

      {/* Active Orders & Lay-aways Dialog (with order statuses and order trails) */}
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
