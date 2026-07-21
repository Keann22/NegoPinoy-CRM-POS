'use client';

import { useState, useEffect, useMemo } from 'react';
import { DateRange } from 'react-day-picker';
import { startOfDay, endOfDay, format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download } from 'lucide-react';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { useUserProfile } from '@/hooks/useUserProfile';
import * as xlsx from 'xlsx';

type PurchaseRow = {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  receivedQty: number;
  unitCost: number;
  totalCost: number;
  supplierId: string | null;
  supplierName: string | null;
  status: string;
  batchName: string | null;
  purchasedAt: string;
};

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PurchasesReport() {
  const { userProfile } = useUserProfile();
  const roles = useMemo(() => userProfile?.roles || [], [userProfile]);
  // Inventory staff see quantities/status only; Owner/Admin also see costs.
  const canSeeCosts = useMemo(() => roles.includes('Owner') || roles.includes('Admin'), [roles]);

  const [date, setDate] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);

  useEffect(() => {
    async function fetchPurchases() {
      if (!date?.from) return;
      setLoading(true);
      try {
        // Day boundaries are computed in the browser's local timezone (PHT for
        // this business), then sent as UTC instants — so "a day" here means a
        // Philippine-time day even though the database stores UTC.
        const start = startOfDay(date.from).toISOString();
        const end = endOfDay(date.to || date.from).toISOString();
        const res = await fetch(`/api/reports/purchases?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load purchases');
        setPurchases(data.purchases || []);
      } catch (err: any) {
        console.error('Failed to fetch purchases report', err);
        alert('Failed to load purchases report: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPurchases();
  }, [date]);

  const totals = useMemo(() => ({
    spend: purchases.reduce((acc, p) => acc + p.totalCost, 0),
    pieces: purchases.reduce((acc, p) => acc + p.qty, 0),
    products: new Set(purchases.map(p => p.productId)).size,
    entries: purchases.length,
  }), [purchases]);

  // Consolidated view: one line per product across every supplier/purchase,
  // with a weighted average cost (cost-bearing lines only, so a ₱0 placeholder
  // entry doesn't drag the average down).
  const byProduct = useMemo(() => {
    const map = new Map<string, {
      productId: string; productName: string; qty: number; totalCost: number;
      costedQty: number; entries: number; suppliers: Set<string>; receivedQty: number;
    }>();
    purchases.forEach(p => {
      const existing = map.get(p.productId) || {
        productId: p.productId, productName: p.productName, qty: 0, totalCost: 0,
        costedQty: 0, entries: 0, suppliers: new Set<string>(), receivedQty: 0,
      };
      existing.qty += p.qty;
      existing.totalCost += p.totalCost;
      if (p.unitCost > 0) existing.costedQty += p.qty;
      existing.entries += 1;
      existing.receivedQty += p.receivedQty;
      if (p.supplierName) existing.suppliers.add(p.supplierName);
      map.set(p.productId, existing);
    });
    return Array.from(map.values())
      .map(p => ({ ...p, avgCost: p.costedQty > 0 ? p.totalCost / p.costedQty : 0 }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [purchases]);

  const bySupplier = useMemo(() => {
    const map = new Map<string, { supplierName: string; items: PurchaseRow[]; totalCost: number; pieces: number }>();
    purchases.forEach(p => {
      const key = p.supplierName || 'No Supplier';
      const existing = map.get(key) || { supplierName: key, items: [], totalCost: 0, pieces: 0 };
      existing.items.push(p);
      existing.totalCost += p.totalCost;
      existing.pieces += p.qty;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [purchases]);

  const rangeLabel = date?.from
    ? (date.to && format(date.to, 'yyyy-MM-dd') !== format(date.from, 'yyyy-MM-dd')
        ? `${format(date.from, 'MMM d, yyyy')} – ${format(date.to, 'MMM d, yyyy')}`
        : format(date.from, 'MMM d, yyyy'))
    : '';

  const handleExportExcel = () => {
    const wb = xlsx.utils.book_new();

    const supplierRows: any[] = [];
    bySupplier.forEach(group => {
      group.items.forEach(item => {
        supplierRows.push({
          'Supplier': group.supplierName,
          'Product': item.productName,
          'Qty': item.qty,
          ...(canSeeCosts ? { 'Unit Cost': item.unitCost, 'Total': item.totalCost } : {}),
          'Received': item.receivedQty,
          'Status': item.status === 'received' ? 'Received' : 'Pending Receipt',
          'Batch': item.batchName || '',
          'Date & Time': format(new Date(item.purchasedAt), 'yyyy-MM-dd hh:mm a'),
        });
      });
      supplierRows.push({
        'Supplier': `${group.supplierName} — SUBTOTAL`,
        'Product': '', 'Qty': group.pieces,
        ...(canSeeCosts ? { 'Unit Cost': '', 'Total': group.totalCost } : {}),
        'Received': '', 'Status': '', 'Batch': '', 'Date & Time': '',
      });
    });
    supplierRows.push({
      'Supplier': 'GRAND TOTAL', 'Product': '', 'Qty': totals.pieces,
      ...(canSeeCosts ? { 'Unit Cost': '', 'Total': totals.spend } : {}),
      'Received': '', 'Status': '', 'Batch': '', 'Date & Time': '',
    });
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(supplierRows), 'By Supplier');

    const productRows: any[] = byProduct.map(p => ({
      'Product': p.productName,
      'Total Qty': p.qty,
      ...(canSeeCosts ? { 'Avg Unit Cost': Number(p.avgCost.toFixed(2)), 'Total Cost': p.totalCost } : {}),
      'Purchases': p.entries,
      'Suppliers': Array.from(p.suppliers).join(', '),
      'Received': p.receivedQty,
    }));
    productRows.push({
      'Product': 'GRAND TOTAL', 'Total Qty': totals.pieces,
      ...(canSeeCosts ? { 'Avg Unit Cost': '', 'Total Cost': totals.spend } : {}),
      'Purchases': totals.entries, 'Suppliers': '', 'Received': '',
    });
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(productRows), 'By Product');

    const fileLabel = date?.from
      ? (date.to && format(date.to, 'yyyyMMdd') !== format(date.from, 'yyyyMMdd')
          ? `${format(date.from, 'yyyyMMdd')}-${format(date.to, 'yyyyMMdd')}`
          : format(date.from, 'yyyyMMdd'))
      : format(new Date(), 'yyyyMMdd');
    xlsx.writeFile(wb, `Purchases_${fileLabel}.xlsx`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <CardTitle>Purchases Report</CardTitle>
            <CardDescription>
              Everything bought on your buying days, consolidated automatically per day.
              {rangeLabel && <> Showing: <span className="font-semibold">{rangeLabel}</span></>}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={loading || purchases.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Download Excel
          </Button>
        </div>
        <ReportDateFilter date={date} setDate={setDate} className="mt-2 mb-0" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={`grid grid-cols-2 gap-4 ${canSeeCosts ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          {canSeeCosts && (
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Total Spend</p>
              <p className="text-xl font-bold">{loading ? '—' : peso(totals.spend)}</p>
            </div>
          )}
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Total Pieces</p>
            <p className="text-xl font-bold">{loading ? '—' : totals.pieces.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Distinct Products</p>
            <p className="text-xl font-bold">{loading ? '—' : totals.products.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Purchase Entries</p>
            <p className="text-xl font-bold">{loading ? '—' : totals.entries.toLocaleString()}</p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-8 w-8 animate-spin mb-4" />
            Loading purchases...
          </div>
        ) : purchases.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground border rounded-md">
            No purchases recorded for this date range.
          </div>
        ) : (
          <Tabs defaultValue="by-supplier">
            <TabsList>
              <TabsTrigger value="by-supplier">By Supplier</TabsTrigger>
              <TabsTrigger value="by-product">By Product (Consolidated)</TabsTrigger>
            </TabsList>

            <TabsContent value="by-supplier" className="space-y-6 mt-4">
              {bySupplier.map(group => (
                <div key={group.supplierName} className="border rounded-md">
                  <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-3 bg-slate-50 border-b rounded-t-md">
                    <p className="font-semibold">{group.supplierName}</p>
                    <p className="text-sm text-muted-foreground">
                      {group.pieces.toLocaleString()} pcs
                      {canSeeCosts && <> · <span className="font-semibold text-foreground">{peso(group.totalCost)}</span></>}
                    </p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        {canSeeCosts && <TableHead className="text-right">Unit Cost</TableHead>}
                        {canSeeCosts && <TableHead className="text-right">Total</TableHead>}
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell className="text-right">{item.qty}</TableCell>
                          {canSeeCosts && <TableCell className="text-right">{peso(item.unitCost)}</TableCell>}
                          {canSeeCosts && <TableCell className="text-right font-semibold">{peso(item.totalCost)}</TableCell>}
                          <TableCell>
                            {item.status === 'received' ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Received</Badge>
                            ) : item.receivedQty > 0 ? (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Partial ({item.receivedQty}/{item.qty})</Badge>
                            ) : (
                              <Badge variant="secondary">Pending Receipt</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {format(new Date(item.purchasedAt), 'MMM d, hh:mm a')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="by-product" className="mt-4">
              <ScrollArea className="max-h-[600px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      {canSeeCosts && <TableHead className="text-right">Avg Unit Cost</TableHead>}
                      {canSeeCosts && <TableHead className="text-right">Total Cost</TableHead>}
                      <TableHead className="text-right">Purchases</TableHead>
                      <TableHead>Suppliers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byProduct.map(p => (
                      <TableRow key={p.productId}>
                        <TableCell className="font-medium">{p.productName}</TableCell>
                        <TableCell className="text-right">{p.qty}</TableCell>
                        {canSeeCosts && <TableCell className="text-right">{peso(p.avgCost)}</TableCell>}
                        {canSeeCosts && <TableCell className="text-right font-semibold">{peso(p.totalCost)}</TableCell>}
                        <TableCell className="text-right">{p.entries}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {Array.from(p.suppliers).join(', ') || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
