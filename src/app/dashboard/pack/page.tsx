'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, ScanLine, X, Plus, Trash2, AlertTriangle, AlertCircle } from 'lucide-react';
import { usePacker } from '@/hooks/usePacker';

export default function PackerApp() {
  const {
    scanning,
    scannedOrderId,
    setScannedOrderId,
    orderDetails,
    orderItems,
    loading,
    warnings,
    boxes,
    startScanner,
    stopScanner,
    handleAddBox,
    handleRemoveBox,
    handleItemQtyChange,
    handleBoxDimensionChange,
    handlePackOrder
  } = usePacker();

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4 space-y-4">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold font-headline flex items-center justify-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          Packer App
        </h1>
        <p className="text-muted-foreground text-sm">Scan packing slips to process orders.</p>
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
            <p className="text-center text-sm text-muted-foreground mt-4">Point your camera at the QR code on the packing slip.</p>
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
              <Badge variant={orderDetails.status === 'Packed' ? 'secondary' : 'default'}>
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
            
            {warnings.length > 0 && (
              <div className="mb-6 space-y-3">
                {warnings.map((warn, idx) => (
                  <div key={idx} className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-md flex items-start gap-3">
                    <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-900">Attention Required</p>
                      <p className="text-sm mt-1">{warn}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handlePackOrder} className="space-y-6">
              
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-semibold text-lg text-slate-800">Box Configuration</h3>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddBox}>
                    <Plus className="h-4 w-4 mr-1" /> Add Box
                  </Button>
                </div>

                {/* Items Allocation Table */}
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left p-3 font-medium text-muted-foreground w-1/3">Item Name</th>
                        <th className="text-center p-3 font-medium text-muted-foreground w-16">Total</th>
                        {boxes.map(box => (
                          <th key={box.id} className="text-center p-3 font-medium text-muted-foreground">
                            {box.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map(item => {
                        let assignedQty = 0;
                        boxes.forEach(b => { assignedQty += (b.items[item.id] || 0); });
                        const isFullyAssigned = assignedQty === item.quantity;

                        return (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="p-3">
                              <span className="font-medium text-slate-800">{item.product_name}</span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`font-bold ${isFullyAssigned ? 'text-emerald-600' : 'text-red-500'}`}>
                                {assignedQty}/{item.quantity}
                              </span>
                            </td>
                            {boxes.map(box => (
                              <td key={box.id} className="p-2 text-center">
                                <Input 
                                  type="number" 
                                  min="0"
                                  className="w-16 h-8 text-center mx-auto"
                                  value={box.items[item.id] || 0}
                                  onChange={(e) => handleItemQtyChange(box.id, item.id, parseInt(e.target.value) || 0)}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Box Dimensions Inputs */}
                <div className="space-y-4 mt-6">
                  {boxes.map((box) => (
                    <div key={box.id} className="bg-slate-50 border p-4 rounded-lg relative">
                      {boxes.length > 1 && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="absolute right-2 top-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleRemoveBox(box.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      
                      <h4 className="font-bold text-slate-700 mb-3">{box.name} Dimensions & Weight</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Length (cm)</Label>
                          <Input type="number" step="0.1" value={box.length} onChange={e => handleBoxDimensionChange(box.id, 'length', e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Width (cm)</Label>
                          <Input type="number" step="0.1" value={box.width} onChange={e => handleBoxDimensionChange(box.id, 'width', e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Height (cm)</Label>
                          <Input type="number" step="0.1" value={box.height} onChange={e => handleBoxDimensionChange(box.id, 'height', e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                          <Input type="number" step="0.01" value={box.weight} onChange={e => handleBoxDimensionChange(box.id, 'weight', e.target.value)} required />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

              </div>

              {orderDetails?.status?.includes('issue') && (
                <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-4 space-y-2 mb-4">
                  <div className="font-semibold flex items-center gap-2"><AlertCircle className="w-5 h-5"/> Unresolved Issue</div>
                  <p className="text-sm">This order has an open issue. Please resolve it on the dashboard before submitting verification.</p>
                </div>
              )}

              {orderDetails?.status !== 'Photo' && orderDetails?.status !== 'On-Hold' && !orderDetails?.status?.includes('issue') && (
                <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-4 space-y-2 mb-4">
                  <div className="font-semibold flex items-center gap-2"><AlertCircle className="w-5 h-5"/> Second Check Required</div>
                  <p className="text-sm">
                    This order hasn&apos;t been verified by a checker yet (current status: &quot;{orderDetails?.status}&quot;).
                    It must go through Second Check / Photo before it can be packed.
                  </p>
                </div>
              )}

              <div className="pt-6 flex gap-3 border-t mt-6">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setScannedOrderId(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading || orderDetails?.status === 'On-Hold' || orderDetails?.status?.includes('issue') || orderDetails?.status !== 'Photo'}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
                  Confirm Packed
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
