'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, AlertTriangle, ChevronDown } from 'lucide-react';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { format } from 'date-fns';
import { usePurchasesReport } from '@/hooks/usePurchasesReport';

export function PurchasesReport() {
  const {
    canSeeCosts,
    canSeeSuppliers,
    date,
    setDate,
    loading,
    purchases,
    unrecorded,
    showUnrecorded,
    setShowUnrecorded,
    supplierOptions,
    drafts,
    setDrafts,
    savingId,
    totals,
    byProduct,
    bySupplier,
    handleRecord,
    handleExportExcel,
    rangeLabel,
    peso
  } = usePurchasesReport();

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
                          {canSeeSuppliers && <TableHead className="min-w-[180px]">Supplier</TableHead>}
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
                              {canSeeSuppliers && (
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
                              )}
                              <TableCell>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  className={`w-full border p-2 rounded-md text-sm ${u.missingCost && !(Number(draft.unitCost) > 0) ? 'border-amber-400' : ''}`}
                                  value={draft.unitCost}
                                  onChange={e => setDrafts(prev => ({ ...prev, [u.id]: { ...draft, unitCost: e.target.value } }))}
                                />
                                {/* costSource can name a supplier ("last bought from X"), so keep it off staff screens. */}
                                {canSeeSuppliers && u.costSource && (
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
              <TabsTrigger value="by-supplier">{canSeeSuppliers ? 'By Supplier' : 'Itemized'}</TabsTrigger>
              <TabsTrigger value="by-product">By Product (Consolidated)</TabsTrigger>
            </TabsList>

            <TabsContent value="by-supplier" className="space-y-6 mt-4">
              {canSeeSuppliers ? (
                bySupplier.map(group => (
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
                ))
              ) : (
                // Staff view: a flat itemized list with no supplier dimension.
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell className="text-right">{item.qty}</TableCell>
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
              )}
            </TabsContent>

            <TabsContent value="by-product" className="mt-4">
              <div className="overflow-y-auto max-h-[600px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      {canSeeCosts && <TableHead className="text-right">Avg Unit Cost</TableHead>}
                      {canSeeCosts && <TableHead className="text-right">Total Cost</TableHead>}
                      <TableHead className="text-right">Purchases</TableHead>
                      {canSeeSuppliers && <TableHead>Suppliers</TableHead>}
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
                        {canSeeSuppliers && (
                          <TableCell className="text-sm text-muted-foreground">
                            {Array.from(p.suppliers).join(', ') || '—'}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
