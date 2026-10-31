'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ClipboardList, ScanLine, X, Check, AlertCircle, AlertTriangle, CameraOff, ArrowLeftRight, PackageX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePicker } from '@/hooks/usePicker';
import { ProductPhotoDialog } from '@/components/dashboard/product-photo-dialog';
import { BorrowDialog, type BorrowTarget } from '@/components/dashboard/picker/borrow-dialog';
import { ReportDamagedDialog } from '@/components/dashboard/supplier-returns/report-damaged-dialog';
import { ShelfGuardDialog } from '@/components/dashboard/picker/shelf-guard-dialog';
import { useShelfGuard } from '@/hooks/picker/useShelfGuard';

function formatMemoryAge(dateStr?: string): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffDays === 0) {
    if (diffHours <= 1) return 'earlier today';
    return `${diffHours} hours ago`;
  }
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default function PickerApp() {
  const {
    scanning,
    cameraError,
    scannedOrderId,
    setScannedOrderId,
    orderDetails,
    pickGroups,
    outOfStockQty,
    qtyDrafts,
    foundKeys,
    productMemories,
    loading,
    viewingPhotoItem,
    setViewingPhotoItem,
    startScanner,
    stopScanner,
    markFound,
    markOutOfStock,
    unmarkedRows,
    handleQtyDraftChange,
    commitOutOfStockQty,
    handleSubmitPicking
  } = usePicker();

  const allRows = pickGroups.flatMap((g) => g.rows);
  const unmarkedCount = unmarkedRows(allRows).length;
  const checkedCount = allRows.length - unmarkedCount;
  // Found / Borrow when the shelf says there isn't enough (owner rule 2026-10-31).
  const guard = useShelfGuard(scannedOrderId, allRows, { markFound, markOutOfStock, setMissingQty: handleQtyDraftChange });

  // Borrowing an item already picked for another order (see borrow-dialog).
  const [borrowTarget, setBorrowTarget] = React.useState<BorrowTarget | null>(null);
  const [borrowedFrom, setBorrowedFrom] = React.useState<Map<string, string>>(new Map());
  // A bad piece found while picking: set it aside for the supplier (Supplier Returns).
  const [damaged, setDamaged] = React.useState<{ id: string; name: string } | null>(null);
  React.useEffect(() => { setBorrowedFrom(new Map()); }, [scannedOrderId]);

  const openBorrow = (key: string) => {
    const row = allRows.find((r) => r.key === key);
    if (row) guard.beforeBorrow(row, () =>
      setBorrowTarget({ rowKey: key, productId: row.productId, productName: row.productName, missingQty: outOfStockQty.get(key) || row.quantity }));
  };
  const onFoundClick = (key: string) => {
    const row = allRows.find((r) => r.key === key);
    if (row) guard.onFound(row); else markFound(key);
  };

  const onBorrowed = (target: BorrowTarget, qty: number, fromShortId: string) => {
    setBorrowedFrom(new Map(borrowedFrom).set(target.rowKey, `${qty} borrowed from #${fromShortId}`));
    if (qty >= target.missingQty) markFound(target.rowKey);
    else handleQtyDraftChange(target.rowKey, String(target.missingQty - qty));
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4 space-y-4">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold font-headline flex items-center justify-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Picker App
        </h1>
        <p className="text-muted-foreground text-sm">Scan order QR to pick items.</p>
      </div>

      {!scanning && !scannedOrderId && (
        <Card className="shadow-md border-primary/20 max-w-md mx-auto w-full">
          <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
            {cameraError ? (
              <div className="w-full space-y-4">
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                    <CameraOff className="h-8 w-8 text-destructive" />
                  </div>
                  <p className="font-semibold text-destructive">{cameraError.title}</p>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-4">
                  {cameraError.steps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
                <Button size="lg" className="w-full text-lg h-14" onClick={startScanner}>
                  Try Again
                </Button>
              </div>
            ) : (
              <>
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
                  <ScanLine className="h-12 w-12 text-primary" />
                </div>
                <Button size="lg" className="w-full text-lg h-14" onClick={startScanner}>
                  Tap to Scan Order
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {scanning && (
        <Card className="max-w-md mx-auto w-full">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle>Scanning...</CardTitle>
            <Button variant="ghost" size="icon" onClick={stopScanner}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <div id="reader" className="w-full rounded overflow-hidden"></div>
            <p className="text-center text-sm text-muted-foreground mt-4">Point your camera at the unified QR code on the order slip.</p>
          </CardContent>
        </Card>
      )}

      {loading && !orderDetails && (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {scannedOrderId && orderDetails && (
        <Card className="border-primary/50 shadow-lg w-full">
          <CardHeader className="bg-primary/5 pb-4">
            <CardTitle className="flex justify-between items-center">
              <Link href={`/dashboard/orders/${scannedOrderId}`} target="_blank" className="hover:underline">
                Order #{scannedOrderId.substring(0, 7).toUpperCase()}
              </Link>
              <Badge variant={orderDetails.status.includes('issue') ? 'destructive' : 'default'}>
                {orderDetails.status}
              </Badge>
            </CardTitle>
            <CardDescription className="text-base text-foreground font-medium">
              {orderDetails.customer_id ? (
                <Link href={`/dashboard/customers/${orderDetails.customer_id}`} target="_blank" className="hover:underline">
                  {orderDetails.customers?.full_name || 'Unknown Customer'}
                </Link>
              ) : (orderDetails.customers?.full_name || 'Unknown Customer')}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmitPicking} className="space-y-6">
              
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-semibold text-lg text-slate-800">Order Items</h3>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 font-medium text-muted-foreground">Item Name</th>
                        <th className="p-3 font-medium text-muted-foreground text-center">Qty</th>
                        <th className="p-3 font-medium text-muted-foreground text-center">Found / OS</th>
                        <th className="p-3 font-medium text-muted-foreground text-center">Missing Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickGroups.map(group => {
                        const renderRow = (
                          key: string,
                          productId: string,
                          name: React.ReactNode,
                          qty: number,
                          indent: boolean
                        ) => {
                          const isFlagged = outOfStockQty.has(key);
                          const isFound = foundKeys.has(key);
                          const memoryHint = productMemories.get(productId);
                          const hasVerifiedMemory = !!(memoryHint && memoryHint.verifiedCount > 0 && memoryHint.actorName);
                          const hasSystemStock = !!(memoryHint && (memoryHint.systemStock ?? 0) > 0);
                          const hasReserveStock = !!(memoryHint && (memoryHint.unit2ReserveStock ?? 0) > 0);
                          const showHint = isFlagged && (hasVerifiedMemory || hasSystemStock || hasReserveStock);

                          return (
                            <React.Fragment key={key}>
                              <tr className={`border-b ${showHint ? '' : 'last:border-0'} ${isFlagged ? 'bg-red-50' : isFound ? 'bg-green-50' : ''}`}>
                                <td className={`p-3 ${indent ? 'pl-8' : ''}`}>
                                  <div className="flex items-center flex-wrap gap-1.5">
                                    {name}
                                    {borrowedFrom.has(key) && (
                                      <Badge variant="outline" className="text-[10px] text-violet-700 bg-violet-50 border-violet-300 font-semibold">
                                        {borrowedFrom.get(key)}
                                      </Badge>
                                    )}
                                    {hasReserveStock && (
                                      <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 border-blue-300 font-semibold">
                                        Unit 2: {memoryHint.unit2ReserveStock} in reserve
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {isFlagged && (
                                      <button type="button" onClick={() => openBorrow(key)}
                                        className="inline-flex items-center gap-1 rounded-md border border-violet-300 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50">
                                        <ArrowLeftRight className="h-3 w-3" />Borrow from another order
                                      </button>
                                    )}
                                    <button type="button"
                                      onClick={() => setDamaged({ id: productId, name: allRows.find((r) => r.key === key)?.productName || 'Item' })}
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-700">
                                      <PackageX className="h-3 w-3" />Damaged?
                                    </button>
                                  </div>
                                </td>
                                <td className="p-3 text-center">
                                  <span className="font-bold">{qty}</span>
                                </td>
                                <td className="p-2 text-center">
                                  <div className="inline-flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => onFoundClick(key)}
                                      aria-pressed={isFound}
                                      className={cn('h-9 min-w-[3.5rem] rounded-md border px-2 text-xs font-semibold',
                                        isFound ? 'border-green-600 bg-green-600 text-white' : 'border-green-300 text-green-700 hover:bg-green-50')}
                                    >
                                      Found
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => markOutOfStock(key, qty)}
                                      aria-pressed={isFlagged}
                                      className={cn('h-9 min-w-[3rem] rounded-md border px-2 text-xs font-semibold',
                                        isFlagged ? 'border-red-600 bg-red-600 text-white' : 'border-red-300 text-red-700 hover:bg-red-50')}
                                    >
                                      OS
                                    </button>
                                  </div>
                                </td>
                                <td className="p-3 text-center">
                                  {isFlagged && (
                                    <input
                                      type="number"
                                      min={1}
                                      max={qty}
                                      value={qtyDrafts.get(key) ?? ''}
                                      onChange={(e) => handleQtyDraftChange(key, e.target.value)}
                                      onBlur={() => commitOutOfStockQty(key, qty)}
                                      className="w-16 text-center border rounded-md px-1 py-1 text-sm"
                                    />
                                  )}
                                </td>
                              </tr>
                              {showHint && (
                                <tr className="bg-amber-50/95 border-b border-amber-200/80">
                                  <td colSpan={4} className={`p-2.5 ${indent ? 'pl-8' : 'pl-4'}`}>
                                    <div className="flex items-start gap-2 text-xs text-amber-950">
                                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                      <div className="space-y-1 w-full">
                                        <p className="font-semibold text-amber-900">
                                          ⚠️ Wait, double check before submitting:
                                        </p>
                                        {hasReserveStock && (
                                          <div className="bg-blue-100/90 text-blue-950 p-2 rounded border border-blue-200 font-medium">
                                            📦 <strong>Unit 2 Reserve has {memoryHint?.unit2ReserveStock} pcs in stock!</strong>
                                            <span className="block text-blue-800 text-[11px] font-normal mt-0.5">
                                              This item is available in Unit 2 bulk storage. Check Unit 2 or request replenishment from the runner instead of reporting an OOS issue.
                                            </span>
                                          </div>
                                        )}
                                        <p className="text-amber-800 leading-relaxed">
                                          {hasVerifiedMemory ? (
                                            <>
                                              <strong>{memoryHint?.actorName}</strong> physically verified <strong>{memoryHint?.verifiedCount} pcs</strong> on shelf ({formatMemoryAge(memoryHint?.auditedAt || '')}). Please check back shelves, adjacent bins, or Room B!
                                            </>
                                          ) : (
                                            <>
                                              System ledger shows <strong>{memoryHint?.systemStock} pcs</strong> in total stock. Please verify if it was placed in an alternate bin or received recently.
                                            </>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        };

                        const setNameButton = (
                          <button
                            type="button"
                            onClick={() => setViewingPhotoItem({ product_name: group.productName, images: group.images } as any)}
                            className="font-medium text-slate-800 underline decoration-dotted underline-offset-2 hover:text-primary text-left"
                          >
                            {group.productName}
                          </button>
                        );

                        if (!group.isSet) {
                          const row = group.rows[0];
                          return renderRow(row.key, row.productId, setNameButton, row.quantity, false);
                        }

                        // Set: a display-only header, then a flaggable row per part.
                        return (
                          <React.Fragment key={group.orderItemId}>
                            <tr className="border-b bg-muted/30">
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  {setNameButton}
                                  <Badge variant="secondary" className="text-[10px]">Set</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">Mark each part below as Found or OS.</p>
                              </td>
                              <td className="p-3 text-center">
                                <span className="font-bold">{group.quantity}</span>
                              </td>
                              <td className="p-3" colSpan={2}></td>
                            </tr>
                            {group.rows.map(row => renderRow(row.key, row.productId, <span className="text-slate-700">{row.productName}</span>, row.quantity, true))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {outOfStockQty.size > 0 && (
                <div className="bg-red-50 text-red-800 p-3 rounded-md flex items-start gap-2 text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
                  <p>
                    <strong>Warning:</strong> You have marked some items as out of stock. Submitting will flag this order with an issue, notify the sales agent, and automatically request procurement for these items.
                  </p>
                </div>
              )}

              <p className={cn('text-sm font-medium', unmarkedCount > 0 ? 'text-amber-700' : 'text-green-700')}>
                {unmarkedCount > 0
                  ? `Checked ${checkedCount} of ${allRows.length} — mark every item as Found or OS to submit.`
                  : `All ${allRows.length} item${allRows.length === 1 ? '' : 's'} checked.`}
              </p>

              <div className="pt-4 flex gap-3 border-t mt-6">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setScannedOrderId(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" variant={outOfStockQty.size > 0 ? "destructive" : "default"} disabled={loading || unmarkedCount > 0}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Submit Picking
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <BorrowDialog target={borrowTarget} toOrderId={scannedOrderId} onClose={() => setBorrowTarget(null)} onBorrowed={onBorrowed} />
      <ShelfGuardDialog
        prompt={guard.prompt}
        onCount={guard.submitCount}
        onNotReceived={guard.notReceivedYet}
        onBothEmpty={guard.confirmBothEmpty}
        onClose={guard.closePrompt}
      />
      <ReportDamagedDialog
        open={!!damaged}
        product={damaged}
        defaultFoundAt="picker"
        hint="Then pick a good one and tap Found, or tap OS if there's none left."
        onClose={() => setDamaged(null)}
      />

      <ProductPhotoDialog
        product={viewingPhotoItem}
        open={!!viewingPhotoItem}
        onOpenChange={(open) => !open && setViewingPhotoItem(null)}
      />
    </div>
  );
}
