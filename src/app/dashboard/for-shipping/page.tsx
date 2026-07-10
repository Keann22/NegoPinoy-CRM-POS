'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Truck, Upload, RotateCcw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkShippedDialog } from '@/components/dashboard/mark-shipped-dialog';
import { RevertPendingDialog } from '@/components/dashboard/revert-pending-dialog';
import { useForShipping } from '@/hooks/useForShipping';

export default function ForShippingPage() {
  const {
    orders,
    loading,
    fileInputRef,
    handleSPXUpload,
    handleExportExcel,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    markShippedOrder,
    setMarkShippedOrder,
    revertOrder,
    setRevertOrder,
    fetchForShippingOrders
  } = useForShipping();

  const totalPages = Math.ceil(orders.length / itemsPerPage);
  const paginatedData = orders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <CardTitle className="font-headline">For Shipping</CardTitle>
              <CardDescription>
                Verified orders ready to be uploaded to the courier and shipped out.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleSPXUpload} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={loading} variant="outline" className="border-primary text-primary hover:bg-primary/10">
                <Upload className="mr-2 h-4 w-4" /> Sync SPX File
              </Button>
              <Button onClick={handleExportExcel} disabled={loading || orders.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
                <Download className="mr-2 h-4 w-4" /> Download Courier Format
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Shipping Type</TableHead>
                <TableHead className="text-right">Shipping Fee</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))}
              {!loading && orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No orders ready for shipping.
                  </TableCell>
                </TableRow>
              )}
              {!loading && paginatedData.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">
                    <Link href={`/dashboard/orders/${order.id}`} className="font-semibold text-primary hover:underline">
                      {order.orderId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{order.shippingName}</div>
                    <div className="text-xs text-muted-foreground">{order.shippingAddress?.city || ''}, {order.shippingAddress?.province || ''}</div>
                  </TableCell>
                  <TableCell className="capitalize">{order.paymentType}</TableCell>
                  <TableCell className="text-right">₱{order.shippingAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setRevertOrder(order)} title="Revert to Processing">
                        <RotateCcw className="h-4 w-4 mr-1" /> Revert
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setMarkShippedOrder({ id: order.id, tracking_number: '' })}>
                        <Truck className="h-4 w-4 mr-1" /> Mark Shipped
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing <strong>{orders.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, orders.length)}</strong> of <strong>{orders.length}</strong> orders
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || loading || orders.length === 0}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      </Card>

      {markShippedOrder && (
        <MarkShippedDialog
            open={!!markShippedOrder}
            onOpenChange={(isOpen) => {
                if (!isOpen) setMarkShippedOrder(null);
            }}
            orderId={markShippedOrder.id}
            currentTrackingNumber={markShippedOrder.tracking_number}
            onSuccess={() => {
                fetchForShippingOrders();
                setMarkShippedOrder(null);
            }}
        />
      )}
      <RevertPendingDialog
        order={revertOrder}
        open={!!revertOrder}
        onOpenChange={(open) => !open && setRevertOrder(null)}
        onSuccess={() => {
          fetchForShippingOrders();
          setRevertOrder(null);
        }}
      />
    </>
  );
}
