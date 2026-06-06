import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useSupabase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Order } from '@/app/dashboard/orders/page';

interface NotForShippingDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NotForShippingDialog({ order, open, onOpenChange, onSuccess }: NotForShippingDialogProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = useSupabase();
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!order || !supabase) return;
    
    if (!reason.trim()) {
      toast({ variant: 'destructive', title: 'Reason required', description: 'Please enter a reason.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ not_for_shipping_reason: reason })
        .eq('id', order.id);

      if (error) throw error;

      toast({
        title: 'Updated Successfully',
        description: 'Order moved to Waiting to be Shipped.',
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Not For Shipping</DialogTitle>
          <DialogDescription>
            Provide a reason why this packed order is not yet ready for shipping. It will be moved to the "Waiting to be Shipped" tab.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Waiting for additional items, Customer requested delay, etc."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Reason'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
