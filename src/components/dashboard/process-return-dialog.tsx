'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Order } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { RotateCcw } from 'lucide-react';

interface ItemReturnState {
  orderItemId: string;
  productId: string;
  productName: string;
  orderedQty: number;
  alreadyReturnedQty: number;
  remainingQty: number;
  returnQty: number;
  dispositionOverride: 'default' | 'restock' | 'exchange' | 'writeoff';
}

interface ProcessReturnDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const REASON_CODES = ['Damaged Item', 'Wrong Item', 'Customer Changed Mind', 'Defective', 'Other'];

export function ProcessReturnDialog({ order, open, onOpenChange, onSuccess }: ProcessReturnDialogProps) {
  const { toast } = useToast();
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();

  const [items, setItems] = useState<ItemReturnState[]>([]);
  const [defaultReturnType, setDefaultReturnType] = useState<'restock' | 'exchange' | 'writeoff' | ''>('restock');
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !order || !supabase) return;
    setIsLoading(true);
    setDefaultReturnType('restock');
    setReasonCode('');
    setNotes('');

    Promise.all([
      supabase
        .from('order_items')
        .select('id, product_id, product_name, quantity')
        .eq('order_id', order.id),
      supabase
        .from('returns')
        .select('order_item_id, quantity')
        .eq('order_id', order.id),
    ]).then(([itemsRes, returnsRes]) => {
      const orderItems = itemsRes.data || [];
      const returns = returnsRes.data || [];

      const returnedByItem = new Map<string, number>();
      returns.forEach(r => {
        if (r.order_item_id) {
          returnedByItem.set(r.order_item_id, (returnedByItem.get(r.order_item_id) || 0) + r.quantity);
        }
      });

      const rows: ItemReturnState[] = orderItems.map(item => {
        const alreadyReturned = returnedByItem.get(item.id) || 0;
        const remaining = Math.max(0, item.quantity - alreadyReturned);
        return {
          orderItemId: item.id,
          productId: item.product_id,
          productName: item.product_name,
          orderedQty: item.quantity,
          alreadyReturnedQty: alreadyReturned,
          remainingQty: remaining,
          returnQty: remaining,
          dispositionOverride: 'default',
        };
      });

      setItems(rows);
      setIsLoading(false);
    });
  }, [open, order, supabase]);

  const handleReturnAll = () => {
    setItems(prev => prev.map(item => ({ ...item, returnQty: item.remainingQty })));
  };

  const handleClearAll = () => {
    setItems(prev => prev.map(item => ({ ...item, returnQty: 0 })));
  };

  const updateItemQty = (orderItemId: string, val: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.orderItemId !== orderItemId) return item;
        const clamped = Math.max(0, Math.min(item.remainingQty, isNaN(val) ? 0 : val));
        return { ...item, returnQty: clamped };
      })
    );
  };

  const updateItemDisposition = (orderItemId: string, disposition: 'default' | 'restock' | 'exchange' | 'writeoff') => {
    setItems(prev =>
      prev.map(item => (item.orderItemId === orderItemId ? { ...item, dispositionOverride: disposition } : item))
    );
  };

  const totalReturnQty = items.reduce((sum, item) => sum + (item.returnQty || 0), 0);
  const activeItemsCount = items.filter(item => item.returnQty > 0).length;

  const handleSubmit = async () => {
    if (!order) return;

    if (totalReturnQty === 0) {
      toast({ variant: 'destructive', title: 'No items selected', description: 'Enter a quantity greater than 0 for at least one item.' });
      return;
    }

    if (!reasonCode) {
      toast({ variant: 'destructive', title: 'Reason required', description: 'Select a reason for this return.' });
      return;
    }

    const unassignedDisposition = items.some(
      item => item.returnQty > 0 && item.dispositionOverride === 'default' && !defaultReturnType
    );
    if (unassignedDisposition) {
      toast({ variant: 'destructive', title: 'Disposition required', description: 'Select a disposition for the returned items.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const itemsToSubmit = items
        .filter(item => item.returnQty > 0)
        .map(item => ({
          orderItemId: item.orderItemId,
          productId: item.productId,
          productName: item.productName,
          quantity: item.returnQty,
          returnType: item.dispositionOverride !== 'default' ? item.dispositionOverride : defaultReturnType,
        }));

      const res = await fetch('/api/inventory/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          items: itemsToSubmit,
          defaultReturnType,
          defaultReasonCode: reasonCode,
          defaultNotes: notes,
          processedBy: userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : null,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to record return.');
      }

      const result = await res.json();
      if (result.allItemsFullyReturned) {
        toast({ title: 'Order marked Returned', description: `All items on this order have been returned.` });
      } else {
        toast({ title: 'Return recorded', description: `Processed ${result.processedCount} item(s) successfully.` });
      }

      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to record return.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            <DialogTitle>Process Return</DialogTitle>
          </div>
          <DialogDescription>
            Review all items in this order and enter the quantity being returned for each item.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading order items...</div>
        ) : (
          <div className="space-y-4 py-2 overflow-y-auto pr-1 flex-1">
            {/* Batch Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Default Disposition
                </label>
                <Select value={defaultReturnType} onValueChange={(v) => setDefaultReturnType(v as any)}>
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue placeholder="Select disposition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="restock">Restock — sellable, restore stock</SelectItem>
                    <SelectItem value="exchange">Exchange — reshipped, no stock change</SelectItem>
                    <SelectItem value="writeoff">Write-off — damaged / unsellable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Reason <span className="text-destructive">*</span>
                </label>
                <Select value={reasonCode} onValueChange={setReasonCode}>
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_CODES.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Items Header & Quick Actions */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Order Items ({items.length})
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleReturnAll} className="h-7 text-xs">
                  Return All
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleClearAll} className="h-7 text-xs text-muted-foreground">
                  Clear All
                </Button>
              </div>
            </div>

            {/* Items Side-by-Side List View */}
            <div className="space-y-2">
              {items.map(item => {
                const isFullyReturned = item.remainingQty === 0;
                return (
                  <div
                    key={item.orderItemId}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3 transition-colors ${
                      item.returnQty > 0 ? 'bg-primary/5 border-primary/30' : 'bg-background border-border opacity-80'
                    } ${isFullyReturned ? 'opacity-50 bg-muted/30' : ''}`}
                  >
                    {/* Item Details */}
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="font-medium text-sm leading-snug">{item.productName}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                          Ordered: {item.orderedQty}
                        </Badge>
                        {item.alreadyReturnedQty > 0 && (
                          <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                            Already returned: {item.alreadyReturnedQty}
                          </Badge>
                        )}
                        {isFullyReturned ? (
                          <Badge variant="secondary" className="text-[11px] px-1.5 py-0 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                            Fully Returned
                          </Badge>
                        ) : (
                          <span className="text-[11px]">Max returnable: {item.remainingQty}</span>
                        )}
                      </div>
                    </div>

                    {/* Quantity & Per-Item Disposition Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-medium sm:hidden">Qty:</label>
                        <Input
                          type="number"
                          min={0}
                          max={item.remainingQty}
                          disabled={isFullyReturned || isSubmitting}
                          value={item.returnQty === 0 ? '' : item.returnQty}
                          placeholder="0"
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            updateItemQty(item.orderItemId, val);
                          }}
                          className="w-20 h-9 text-center font-semibold"
                        />
                        <span className="text-xs text-muted-foreground">/ {item.remainingQty}</span>
                      </div>

                      {/* Optional disposition override */}
                      {item.returnQty > 0 && (
                        <Select
                          value={item.dispositionOverride}
                          onValueChange={(val) => updateItemDisposition(item.orderItemId, val as any)}
                        >
                          <SelectTrigger className="h-9 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default" className="text-xs">
                              {defaultReturnType ? `Default (${defaultReturnType})` : 'Default'}
                            </SelectItem>
                            <SelectItem value="restock" className="text-xs">Restock</SelectItem>
                            <SelectItem value="exchange" className="text-xs">Exchange</SelectItem>
                            <SelectItem value="writeoff" className="text-xs">Write-off</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Notes */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Notes (optional)
              </label>
              <Textarea
                placeholder="Return tracking number, reason details, customer agreement, etc..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[64px] text-sm"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-3 pt-3 border-t">
          <div className="text-xs text-muted-foreground">
            {totalReturnQty > 0 ? (
              <span className="font-medium text-foreground">
                Returning {activeItemsCount} item{activeItemsCount !== 1 ? 's' : ''} ({totalReturnQty} unit{totalReturnQty !== 1 ? 's' : ''})
              </span>
            ) : (
              <span>No items selected</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || totalReturnQty === 0 || isLoading}
            >
              {isSubmitting ? 'Processing...' : `Process Return (${totalReturnQty})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
