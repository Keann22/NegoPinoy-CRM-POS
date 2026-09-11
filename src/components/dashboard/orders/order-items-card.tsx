'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, PackageX, CheckCircle2, Info } from 'lucide-react';
import { useOrderItemsStatus, type EnrichedOrderItem } from '@/hooks/useOrderItemsStatus';
import type { OrderItem, OrderStatus } from '@/types';

interface OrderItemsCardProps {
  orderId: string;
  orderStatus: OrderStatus | undefined;
  items: OrderItem[];
}

export function OrderItemsCard({ orderId, orderStatus, items }: OrderItemsCardProps) {
  const { enrichedItems, problemCount, reportedCount } = useOrderItemsStatus(orderId, orderStatus, items);
  const [activeItem, setActiveItem] = useState<EnrichedOrderItem | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Order Items</CardTitle>
          {items.length > 0 && (
            problemCount > 0 || orderStatus === 'Picked (with issue)' ? (
              <Badge variant="destructive" className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {problemCount > 0 ? `${problemCount} item${problemCount > 1 ? 's' : ''} need${problemCount > 1 ? '' : 's'} attention` : 'Order has reported issue'}
              </Badge>
            ) : (
              <Badge variant="outline" className="flex items-center gap-1.5 border-emerald-300 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All items in stock
              </Badge>
            )
          )}
        </div>
      </CardHeader>
      <CardContent>
        {(problemCount > 0 || orderStatus === 'Picked (with issue)') && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              {problemCount > 0
                ? `This order is being held on ${problemCount} item${problemCount > 1 ? 's' : ''}.`
                : 'This order was flagged with an issue during picking.'}
              {reportedCount > 0
                ? ` ${reportedCount} ${reportedCount > 1 ? 'have' : 'has'} a reported inventory issue — click "View issue" to see why it isn't shipping yet.`
                : ' The flagged item(s) are currently out of stock.'}
            </p>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Line Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrichedItems.length > 0 ? enrichedItems.map(item => (
              <TableRow
                key={item.id}
                className={
                  item.severity === 2 ? 'bg-red-50/60 hover:bg-red-50'
                  : item.severity === 1 ? 'bg-amber-50/60 hover:bg-amber-50'
                  : undefined
                }
              >
                <TableCell className="font-medium">{item.productName}</TableCell>
                <TableCell>
                  <ItemStatusCell item={item} onViewIssue={() => setActiveItem(item)} />
                </TableCell>
                <TableCell className="text-center">{item.quantity}</TableCell>
                <TableCell className="text-right">₱{(item.sellingPriceAtSale || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right text-destructive">- ₱{(item.discount || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right font-medium">₱{(((item.sellingPriceAtSale || 0) - (item.discount || 0)) * (item.quantity || 1)).toFixed(2)}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className="h-24 text-center">No items found for this order.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <ItemIssueDialog item={activeItem} onClose={() => setActiveItem(null)} />
    </Card>
  );
}

function ItemStatusCell({ item, onViewIssue }: { item: EnrichedOrderItem; onViewIssue: () => void }) {
  if (item.severity === 2) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="flex items-center gap-1">
          <PackageX className="h-3 w-3" />
          {item.hasComponentIssue ? 'Missing component' : 'Issue reported'}
        </Badge>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onViewIssue}>
          View issue
        </Button>
      </div>
    );
  }
  if (item.severity === 1) {
    return (
      <Badge variant="outline" className="flex w-fit items-center gap-1 border-amber-300 bg-amber-100 text-amber-800">
        <AlertCircle className="h-3 w-3" /> Out of stock
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="flex w-fit items-center gap-1 border-emerald-200 text-emerald-700">
      <CheckCircle2 className="h-3 w-3" /> In stock
    </Badge>
  );
}

function ItemIssueDialog({ item, onClose }: { item: EnrichedOrderItem | null; onClose: () => void }) {
  const issues = item?.issues && item.issues.length > 0
    ? item.issues
    : item?.issue
    ? [item.issue]
    : [];

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="h-5 w-5 text-red-600" />
            Inventory Issue
          </DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold">{item.productName}</p>
              <p className="text-xs text-muted-foreground">Ordered quantity: {item.quantity}</p>
            </div>

            {issues.length > 0 ? (
              issues.map((issue, idx) => (
                <div key={issue.id || idx} className="space-y-3 rounded-lg border p-3">
                  {issue.isComponentIssue && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
                      <PackageX className="h-3.5 w-3.5" />
                      <span>Missing Component: {issue.componentName || issue.product_name}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-2.5 text-xs">
                    {issue.out_of_stock_qty != null && (
                      <div>
                        <p className="text-muted-foreground">Reported short</p>
                        <p className="font-semibold text-red-600">{issue.out_of_stock_qty} unit{issue.out_of_stock_qty > 1 ? 's' : ''}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground">Reported by</p>
                      <p className="font-medium">{issue.reported_by_name || 'System'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Reported on</p>
                      <p className="font-medium">{format(new Date(issue.created_at), 'MMM d, h:mm a')}</p>
                    </div>
                  </div>

                  {issue.messages && issue.messages.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">Issue discussion</p>
                      <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2.5">
                        {issue.messages.map(msg => {
                          const isSales = msg.sender_role === 'sales';
                          return (
                            <div key={msg.id} className={`flex flex-col ${isSales ? 'items-end' : 'items-start'}`}>
                              <span className="mb-0.5 text-[10px] text-muted-foreground">
                                {msg.sender_name || (isSales ? 'Sales' : 'Picker')}
                              </span>
                              <div className={`max-w-[90%] whitespace-pre-wrap rounded-lg p-2 text-xs shadow-sm ${isSales ? 'rounded-tr-none bg-indigo-600 text-white' : 'rounded-tl-none border bg-white text-slate-800'}`}>
                                {msg.message}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No discussion has been added to this issue yet.</p>
                  )}
                </div>
              ))
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>This item is currently out of stock, but no one has filed an inventory issue for it yet.</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
