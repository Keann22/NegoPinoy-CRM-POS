'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertReviewTrailDialog } from '@/components/dashboard/inventory/alert-review-trail-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { 
  ShieldAlert, 
  Search, 
  History, 
  RefreshCw, 
  Package, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Filter, 
  Edit3, 
  ArrowUpDown,
  ShoppingBag
} from 'lucide-react';

interface AlertedProductItem {
  productId: string;
  name: string;
  variantName: string | null;
  sku: string | null;
  shelfLocation: string;
  currentStock: number;
  sellingPrice: number | string | null;
  image: string | null;
  alertCount: number;
  latestAlertAt: string;
  firstAlertAt: string;
  latestAnomalyType: string;
  latestAlertNotes: string;
  stockBeforeAlert: number | null;
  openOrdersCount: number;
  openOrdersQty: number;
  lastPhysicalAudit: {
    actorName: string;
    physicalCount: number;
    auditedAt: string;
    notes: string;
  } | null;
}

export default function AlertReviewPage() {
  const [items, setItems] = useState<AlertedProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'negative' | 'zero' | 'positive'>('all');
  const [rangeFilter, setRangeFilter] = useState<'recent' | 'today' | 'all'>('recent');
  
  // Trail dialog state
  const [trailProductId, setTrailProductId] = useState<string | null>(null);
  const [trailOpen, setTrailOpen] = useState(false);

  // Quick physical count correction modal
  const [adjustItem, setAdjustItem] = useState<AlertedProductItem | null>(null);
  const [newShelfCount, setNewShelfCount] = useState<string>('');
  const [adjustNotes, setAdjustNotes] = useState<string>('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

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
      const matchesSearch = 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.variantName && item.variantName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.shelfLocation && item.shelfLocation.toLowerCase().includes(searchQuery.toLowerCase()));

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

  const handleOpenAdjust = (item: AlertedProductItem) => {
    setAdjustItem(item);
    setNewShelfCount(String(item.lastPhysicalAudit ? item.lastPhysicalAudit.physicalCount : Math.max(0, item.currentStock)));
    setAdjustNotes(`Admin review true-up for ${item.name}`);
  };

  const handleSubmitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem || isNaN(Number(newShelfCount))) return;

    setIsSubmittingAdjust(true);
    try {
      const res = await fetch('/api/inventory/guardian/anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_physical_count',
          payload: {
            productId: adjustItem.productId,
            physicalShelfCount: Number(newShelfCount),
            notes: adjustNotes || 'Physical count verified from Alert Review Sheet',
            actorName: 'Admin Review'
          }
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update stock');

      toast({
        title: 'Stock Updated',
        description: `${adjustItem.name}: physical shelf set to ${newShelfCount}. New ledger stock: ${data.newStockLevel}.`
      });

      // Update local state
      setItems(prev => prev.map(i => {
        if (i.productId === adjustItem.productId) {
          return {
            ...i,
            currentStock: data.newStockLevel,
            lastPhysicalAudit: {
              actorName: 'Admin Review',
              physicalCount: Number(newShelfCount),
              auditedAt: new Date().toISOString(),
              notes: adjustNotes
            }
          };
        }
        return i;
      }));

      setAdjustItem(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: err.message });
    } finally {
      setIsSubmittingAdjust(false);
    }
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
            Purchasing-sheet style review of all items alerted via Telegram since yesterday. Inspect stock, active customer demand, and full audit trails one by one.
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
              <button
                type="button"
                onClick={() => setRangeFilter('recent')}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  rangeFilter === 'recent' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Since Yesterday
              </button>
              <button
                type="button"
                onClick={() => setRangeFilter('today')}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  rangeFilter === 'today' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Today Only
              </button>
              <button
                type="button"
                onClick={() => setRangeFilter('all')}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  rangeFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Time
              </button>
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
                filteredItems.map((item, idx) => {
                  const isNeg = item.currentStock < 0;
                  const isZero = item.currentStock === 0;

                  return (
                    <tr key={item.productId} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center font-mono text-[11px] text-muted-foreground">
                        {idx + 1}
                      </td>

                      {/* Product Name & Details */}
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-9 h-9 object-cover rounded border shrink-0" />
                          ) : (
                            <div className="w-9 h-9 bg-slate-100 rounded border flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 block truncate">
                              {item.name} {item.variantName && !item.name.includes(item.variantName) ? `[${item.variantName}]` : ''}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-0.5">
                              <span>SKU: {item.sku || 'N/A'}</span>
                              {item.sellingPrice && <span>₱{Number(item.sellingPrice).toFixed(2)}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Shelf Location */}
                      <td className="p-3 text-center font-mono font-medium text-slate-700">
                        {item.shelfLocation}
                      </td>

                      {/* Current Inventory */}
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded font-bold font-mono text-xs ${
                          isNeg 
                            ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                            : isZero 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {item.currentStock}
                        </span>
                      </td>

                      {/* Active Demand (Unpicked Orders) */}
                      <td className="p-3 text-center">
                        {item.openOrdersQty > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-slate-900 font-mono">
                              {item.openOrdersQty} pcs
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({item.openOrdersCount} open order{item.openOrdersCount > 1 ? 's' : ''})
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">0 needed</span>
                        )}
                      </td>

                      {/* Staff Audit Status */}
                      <td className="p-3">
                        {item.lastPhysicalAudit ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span className="font-semibold text-slate-800">
                                {item.lastPhysicalAudit.actorName}: {item.lastPhysicalAudit.physicalCount} pcs
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground block">
                              {format(new Date(item.lastPhysicalAudit.auditedAt), 'MMM d, h:mm a')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">
                            Pending audit
                          </span>
                        )}
                      </td>

                      {/* Alert Info */}
                      <td className="p-3 text-center">
                        <Badge variant="outline" className="font-bold text-[10px] py-0.5">
                          {item.alertCount}x sent
                        </Badge>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          {format(new Date(item.latestAlertAt), 'h:mm a')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right pr-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenTrail(item.productId)}
                            className="h-7 px-2.5 text-[11px] gap-1 font-semibold text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50 border-indigo-200"
                          >
                            <History className="h-3 w-3" />
                            View Trail
                          </Button>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenAdjust(item)}
                            className="h-7 px-2 text-[11px] gap-1 font-medium"
                          >
                            <Edit3 className="h-3 w-3" />
                            Set Count
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      {/* Quick Count Adjustment Dialog */}
      <Dialog open={!!adjustItem} onOpenChange={open => !open && setAdjustItem(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleSubmitAdjust}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                Set Physical Shelf Count
              </DialogTitle>
              <DialogDescription className="text-xs">
                True up inventory for <strong>{adjustItem?.name}</strong>. In NegoPinoy, ledger stock will be set to: Physical Count − Active Reservations ({adjustItem?.openOrdersQty || 0} pcs).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4 text-xs">
              <div>
                <label className="font-semibold block mb-1">
                  How many units are physically on the shelf right now?
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={newShelfCount}
                  onChange={e => setNewShelfCount(e.target.value)}
                  placeholder="0"
                  className="font-bold text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="font-medium text-muted-foreground block mb-1">
                  Notes / Audit explanation
                </label>
                <Input
                  type="text"
                  value={adjustNotes}
                  onChange={e => setAdjustNotes(e.target.value)}
                  placeholder="e.g. Verified empty shelf with warehouse staff"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setAdjustItem(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmittingAdjust} className="bg-indigo-600 hover:bg-indigo-700">
                {isSubmittingAdjust ? 'Updating...' : 'Save Physical Count'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
