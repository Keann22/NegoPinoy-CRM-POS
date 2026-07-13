'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ClipboardList, ScanLine, X, Check, AlertCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { usePicker } from '@/hooks/usePicker';
import { ProductPhotoDialog } from '@/components/dashboard/product-photo-dialog';

export default function PickerApp() {
  const {
    scanning,
    scannedOrderId,
    setScannedOrderId,
    orderDetails,
    orderItems,
    outOfStockQty,
    qtyDrafts,
    loading,
    viewingPhotoItem,
    setViewingPhotoItem,
    startScanner,
    stopScanner,
    toggleOutOfStock,
    handleQtyDraftChange,
    commitOutOfStockQty,
    handleSubmitPicking
  } = usePicker();

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
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
              <ScanLine className="h-12 w-12 text-primary" />
            </div>
            <Button size="lg" className="w-full text-lg h-14" onClick={startScanner}>
              Tap to Scan Order
            </Button>
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
                        <th className="p-3 font-medium text-muted-foreground text-center">Out of Stock</th>
                        <th className="p-3 font-medium text-muted-foreground text-center">Missing Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map(item => {
                        const isFlagged = outOfStockQty.has(item.id);
                        return (
                        <tr key={item.id} className={`border-b last:border-0 ${isFlagged ? 'bg-red-50' : ''}`}>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => setViewingPhotoItem(item)}
                              className="font-medium text-slate-800 underline decoration-dotted underline-offset-2 hover:text-primary text-left"
                            >
                              {item.product_name}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-bold">{item.quantity}</span>
                          </td>
                          <td className="p-3 text-center">
                            <Checkbox
                              checked={isFlagged}
                              onCheckedChange={() => toggleOutOfStock(item.id, item.quantity)}
                            />
                          </td>
                          <td className="p-3 text-center">
                            {isFlagged && (
                              <input
                                type="number"
                                min={1}
                                max={item.quantity}
                                value={qtyDrafts.get(item.id) ?? ''}
                                onChange={(e) => handleQtyDraftChange(item.id, e.target.value)}
                                onBlur={() => commitOutOfStockQty(item.id, item.quantity)}
                                className="w-16 text-center border rounded-md px-1 py-1 text-sm"
                              />
                            )}
                          </td>
                        </tr>
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

              <div className="pt-4 flex gap-3 border-t mt-6">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setScannedOrderId(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" variant={outOfStockQty.size > 0 ? "destructive" : "default"} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Submit Picking
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <ProductPhotoDialog
        product={viewingPhotoItem}
        open={!!viewingPhotoItem}
        onOpenChange={(open) => !open && setViewingPhotoItem(null)}
      />
    </div>
  );
}
