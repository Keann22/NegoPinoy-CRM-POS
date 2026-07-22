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
import { Loader2, Download, AlertTriangle, ChevronDown } from 'lucide-react';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
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

// Stock that arrived but was never costed — see the notes in
// /api/reports/purchases. These are invisible to the report proper because they
// have no supplier and no price, so they get their own banner.
type UnrecordedRow = {
  id: string;
  productName: string;
  expectedQty: number;
  receivedQty: number;
  unitCost: number;
  missingSupplier: boolean;
  missingCost: boolean;
  requestedByName: string | null;
  source: string;
  suggestedSupplierId: string | null;
  suggestedUnitCost: number | null;
  costSource: string | null;
  costSourceDate: string | null;
  costConflict: { bookCost: number; lastPurchaseCost: number } | null;
  receivedAt: string | null;
};

type SupplierOption = { id: string; name: string };

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PurchasesReport() {
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const roles = useMemo(() => userProfile?.roles || [], [userProfile]);
  // Inventory staff see quantities/status only; Owner/Admin also see costs.
  const canSeeCosts = useMemo(() => roles.includes('Owner') || roles.includes('Admin'), [roles]);

  const [date, setDate] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [unrecorded, setUnrecorded] = useState<UnrecordedRow[]>([]);
  const [showUnrecorded, setShowUnrecorded] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  // Per-row edits, keyed by item id, seeded from the server's suggestions.
  const [drafts, setDrafts] = useState<Record<string, { supplierId: string; unitCost: string; receivedQty: string; receivedAt: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
        const rows: UnrecordedRow[] = data.unrecorded || [];
        setUnrecorded(rows);
        setSupplierOptions(data.suppliers || []);
        setDrafts(Object.fromEntries(rows.map(r => [r.id, {
          supplierId: r.suggestedSupplierId || '',
          unitCost: r.suggestedUnitCost ? String(r.suggestedUnitCost) : '',
          receivedQty: String(r.receivedQty),
          // <input type="date"> wants yyyy-MM-dd in local time, which is PHT here.
          receivedAt: r.receivedAt ? format(new Date(r.receivedAt), 'yyyy-MM-dd') : '',
        }])));
      } catch (err: any) {
        console.error('Failed to fetch purchases report', err);
        alert('Failed to load purchases report: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPurchases();
  }, [date, reloadKey]);

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

  const handleRecord = async (row: UnrecordedRow) => {
    const draft = drafts[row.id] || { supplierId: '', unitCost: '', receivedQty: String(row.receivedQty), receivedAt: '' };
    const cost = Number(draft.unitCost);
    const qty = draft.receivedQty === '' ? null : Number(draft.receivedQty);
    const qtyChanged = qty !== null && qty !== row.receivedQty;

    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
      toast({ variant: 'destructive', title: 'Invalid quantity', description: 'Received must be zero or more.' });
      return;
    }
    if (!draft.supplierId && !(cost > 0) && !qtyChanged) {
      toast({ variant: 'destructive', title: 'Nothing to record', description: 'Pick a supplier, enter a unit cost, or correct the received quantity.' });
      return;
    }
    if (qtyChanged && !window.confirm(
      `Change received for ${row.productName} from ${row.receivedQty} to ${qty}?\n\n` +
      `This moves live stock by ${qty - row.receivedQty > 0 ? '+' : ''}${qty - row.receivedQty} and amends the inventory ledger.`
    )) {
      return;
    }

    setSavingId(row.id);
    try {
      const res = await fetch('/api/reports/purchases/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: row.id,
          supplierId: draft.supplierId || null,
          unitCost: cost || null,
          receivedQty: qtyChanged ? qty : null,
          receivedAt: draft.receivedAt || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to record');

      const parts = [`${row.productName} recorded${result.supplierName ? ` under ${result.supplierName}` : ''}`];
      parts[0] += draft.receivedAt ? ` on ${format(new Date(draft.receivedAt), 'MMM d')}.` : '.';
      if (result.qtyDelta) {
        parts.push(`Received corrected to ${qty} (stock ${result.qtyDelta > 0 ? '+' : ''}${result.qtyDelta}).`);
      }
      if (result.expectedNow !== null) {
        parts.push(`Valued at ${result.expectedNow} delivered rather than ${result.expectedWas} requested.`);
      }
      if (result.linesUpdated > 0) {
        parts.push(`COGS backfilled onto ${result.linesUpdated} sold order line${result.linesUpdated === 1 ? '' : 's'} (${peso(Number(result.cogsAdded))}).`);
      }
      toast({ title: 'Purchase recorded', description: parts.join(' ') });

      setUnrecorded(prev => prev.filter(u => u.id !== row.id));
      // The buy is dated to when the goods landed, which may fall outside the
      // range on screen - refetch so the report reflects wherever it landed.
      setReloadKey(k => k + 1);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not record', description: err.message });
    } finally {
      setSavingId(null);
    }
  };

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
        {!loading && unrecorded.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-900">
                  {unrecorded.length} received {unrecorded.length === 1 ? 'item is' : 'items are'} missing a supplier or cost
                </p>
                <p className="text-sm text-amber-800 mt-1">
                  {unrecorded.reduce((acc, u) => acc + u.receivedQty, 0).toLocaleString()} pcs were taken into stock without going
                  through the Buy flow, so no supplier and no price was ever attached. They are counted as ₱0 in inventory and do not
                  appear anywhere in this report. This list covers <span className="font-semibold">all dates</span>, not just the
                  selected range.
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 mt-2 text-amber-900"
                  onClick={() => setShowUnrecorded(v => !v)}
                >
                  {showUnrecorded ? 'Hide' : 'Show'} the {unrecorded.length} {unrecorded.length === 1 ? 'item' : 'items'}
                  <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${showUnrecorded ? 'rotate-180' : ''}`} />
                </Button>

                {showUnrecorded && (
                  // Native overflow rather than <ScrollArea>: that component pairs
                  // overflow-hidden on the root with an h-full viewport, so a
                  // max-h-* class clips the list instead of making it scrollable.
                  <div className="max-h-[420px] overflow-y-auto overflow-x-auto mt-3 rounded-md border border-amber-200 bg-white">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="min-w-[180px]">Supplier</TableHead>
                          <TableHead className="w-[120px]">Unit Cost (₱)</TableHead>
                          <TableHead className="w-[150px]">Received On</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unrecorded.map(u => {
                          const draft = drafts[u.id] || { supplierId: '', unitCost: '' };
                          return (
                            <TableRow key={u.id}>
                              <TableCell className="font-medium">
                                {u.productName}
                                {u.requestedByName && (
                                  <span className="block text-xs text-muted-foreground">req. {u.requestedByName}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  className={`w-[80px] border p-2 rounded-md text-sm text-right ${Number(draft.receivedQty) !== u.receivedQty ? 'border-blue-500 font-semibold' : u.receivedQty > u.expectedQty ? 'border-amber-400' : ''}`}
                                  value={draft.receivedQty}
                                  onChange={e => setDrafts(prev => ({ ...prev, [u.id]: { ...draft, receivedQty: e.target.value } }))}
                                />
                                {u.receivedQty > u.expectedQty && (
                                  <span className="block text-xs text-amber-700 mt-1">
                                    {u.expectedQty} expected
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <select
                                  className={`w-full border p-2 rounded-md bg-white text-sm ${u.missingSupplier && !draft.supplierId ? 'border-amber-400' : ''}`}
                                  value={draft.supplierId}
                                  onChange={e => setDrafts(prev => ({ ...prev, [u.id]: { ...draft, supplierId: e.target.value } }))}
                                >
                                  <option value="">-- Select supplier --</option>
                                  {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                              </TableCell>
                              <TableCell>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  className={`w-full border p-2 rounded-md text-sm ${u.missingCost && !(Number(draft.unitCost) > 0) ? 'border-amber-400' : ''}`}
                                  value={draft.unitCost}
                                  onChange={e => setDrafts(prev => ({ ...prev, [u.id]: { ...draft, unitCost: e.target.value } }))}
                                />
                                {u.costSource && (
                                  <span className="block text-xs text-muted-foreground mt-1">
                                    {u.costSource}
                                    {u.costSourceDate && ` · ${format(new Date(u.costSourceDate), 'MMM d')}`}
                                  </span>
                                )}
                                {u.costConflict && (
                                  <span className="block text-xs text-amber-700 mt-1">
                                    price book says {peso(u.costConflict.bookCost)} — check which is right
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <input
                                  type="date"
                                  className={`w-full border p-2 rounded-md text-sm ${!draft.receivedAt ? 'border-amber-400' : ''}`}
                                  value={draft.receivedAt}
                                  onChange={e => setDrafts(prev => ({ ...prev, [u.id]: { ...draft, receivedAt: e.target.value } }))}
                                />
                                <span className="block text-xs text-muted-foreground mt-1">
                                  {u.receivedAt ? 'from the stock receipt' : 'no receipt found — please set'}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{u.source}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  onClick={() => handleRecord(u)}
                                  disabled={savingId === u.id}
                                >
                                  {savingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
