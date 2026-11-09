'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, Receipt } from 'lucide-react';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { format } from 'date-fns';
import { usePurchasesReport } from '@/hooks/usePurchasesReport';
import { useReceiptDrafts } from '@/hooks/useReceiptDrafts';
import { SavedReceiptsDialog } from '@/components/dashboard/procurement/saved-receipts-dialog';
import { UnrecordedPurchasesBanner } from '@/components/dashboard/reports/unrecorded-purchases-banner';

export function PurchasesReport() {
  const router = useRouter();
  const { drafts: receiptDrafts, loading: receiptDraftsLoading, deleteDraft: deleteReceiptDraft } = useReceiptDrafts();
  const [savedReceiptsOpen, setSavedReceiptsOpen] = useState(false);
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
    savingAll,
    readyToRecordCount,
    totals,
    byProduct,
    bySupplier,
    handleRecord,
    handleRecordAllReady,
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
        {/* Saved scans carry the supplier name and a photo of the receipt (prices), so management only. */}
        {!loading && canSeeSuppliers && receiptDrafts.length > 0 && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50/70 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Receipt className="h-5 w-5 shrink-0 text-indigo-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-indigo-950">
                    {receiptDrafts.length} saved receipt scan {receiptDrafts.length === 1 ? 'draft' : 'drafts'} waiting for review
                  </p>
                  <p className="text-sm text-indigo-800 mt-0.5">
                    Receipt photos saved during procurement. You can review items and record them into purchases.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-100 font-semibold self-start sm:self-auto shrink-0"
                onClick={() => setSavedReceiptsOpen(true)}
              >
                Review Saved Receipts ({receiptDrafts.length})
              </Button>
            </div>
          </div>
        )}

        {!loading && (
          <UnrecordedPurchasesBanner
            unrecorded={unrecorded}
            showUnrecorded={showUnrecorded}
            setShowUnrecorded={setShowUnrecorded}
            canSeeSuppliers={canSeeSuppliers}
            canSeeCosts={canSeeCosts}
            supplierOptions={supplierOptions}
            drafts={drafts}
            setDrafts={setDrafts}
            savingId={savingId}
            handleRecord={handleRecord}
            peso={peso}
            handleRecordAllReady={handleRecordAllReady}
            savingAll={savingAll}
            readyToRecordCount={readyToRecordCount}
          />
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

      <SavedReceiptsDialog
        open={savedReceiptsOpen}
        onOpenChange={setSavedReceiptsOpen}
        drafts={receiptDrafts}
        loading={receiptDraftsLoading}
        onResume={() => {
          setSavedReceiptsOpen(false);
          router.push('/dashboard/reports/procurement');
        }}
        onDelete={deleteReceiptDraft}
      />
    </Card>
  );
}
