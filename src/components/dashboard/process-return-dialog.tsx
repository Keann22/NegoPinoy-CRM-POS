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

interface OrderItemRow {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
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

  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [processedItemIds, setProcessedItemIds] = useState<string[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [returnType, setReturnType] = useState<'restock' | 'exchange' | 'writeoff' | ''>('');
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !order || !supabase) return;
    setIsLoading(true);
    setProcessedItemIds([]);
    resetForm();
    supabase
      .from('order_items')
      .select('id, product_id, product_name, quantity')
      .eq('order_id', order.id)
      .then(({ data, error }) => {
        if (!error && data) setItems(data);
        setIsLoading(false);
      });
  }, [open, order, supabase]);

  const resetForm = () => {
    setSelectedItemId('');
    setQuantity('');
    setReturnType('');
    setReasonCode('');
    setNotes('');
  };

  const selectedItem = items.find(i => i.id === selectedItemId);

  const handleRecordReturn = async () => {
    if (!order || !selectedItem || !returnType) {
      toast({ variant: 'destructive', title: 'Missing info', description: 'Select an item and a return type.' });
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0 || qty > selectedItem.quantity) {
      toast({ variant: 'destructive', title: 'Invalid quantity', description: `Enter a quantity between 1 and ${selectedItem.quantity}.` });
      return;
    }
    if (!reasonCode) {
      toast({ variant: 'destructive', title: 'Reason required', description: 'Select a reason for this return.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          orderItemId: selectedItem.id,
          productId: selectedItem.product_id,
          productName: selectedItem.product_name,
          quantity: qty,
          returnType,
          reasonCode,
          notes,
          processedBy: userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      setProcessedItemIds(prev => [...prev, selectedItem.id]);
      toast({ title: 'Return recorded', description: `${qty} x ${selectedItem.product_name} recorded as ${returnType}.` });
      resetForm();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to record return.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = async () => {
    if (!order || !supabase) {
      onOpenChange(false);
      return;
    }
    if (processedItemIds.length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      const { data: returns } = await supabase
        .from('returns')
        .select('order_item_id, quantity')
        .eq('order_id', order.id);

      const returnedByItem = new Map<string, number>();
      (returns || []).forEach(r => {
        if (!r.order_item_id) return;
        returnedByItem.set(r.order_item_id, (returnedByItem.get(r.order_item_id) || 0) + r.quantity);
      });

      const allItemsFullyReturned = items.every(item => (returnedByItem.get(item.id) || 0) >= item.quantity);

      if (allItemsFullyReturned) {
        await supabase.from('orders').update({ status: 'Returned' }).eq('id', order.id);
        toast({ title: 'Order marked Returned', description: 'All items on this order have been returned.' });
      } else {
        toast({ title: 'Partial return recorded', description: 'Not all items are returned yet — order status unchanged.' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to finalize return.' });
    }

    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Process Return</DialogTitle>
          <DialogDescription>
            Record which item is being returned, how much, and what happens to it: restocked (sellable), exchanged (reshipped, no stock change), or written off (damaged, not sellable).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {processedItemIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {processedItemIds.map(id => {
                const item = items.find(i => i.id === id);
                return item ? <Badge key={id} variant="secondary">✓ {item.product_name}</Badge> : null;
              })}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Item</label>
            <Select value={selectedItemId} onValueChange={setSelectedItemId} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? 'Loading items...' : 'Select an item'} />
              </SelectTrigger>
              <SelectContent>
                {items.map(item => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.product_name} (qty {item.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quantity Returned</label>
            <Input
              type="number"
              min={1}
              max={selectedItem?.quantity}
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={!selectedItem}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Disposition</label>
            <Select value={returnType} onValueChange={(v) => setReturnType(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="What happens to this item?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="restock">Restock — sellable, add back to inventory</SelectItem>
                <SelectItem value="exchange">Exchange — reshipped, no stock change</SelectItem>
                <SelectItem value="writeoff">Write-off — damaged, not sellable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger>
                <SelectValue placeholder="-- Select Reason --" />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              placeholder="Additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleRecordReturn} disabled={isSubmitting || !selectedItem} className="sm:mr-auto">
            {isSubmitting ? 'Recording...' : 'Record This Item'}
          </Button>
          <Button onClick={handleDone}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
