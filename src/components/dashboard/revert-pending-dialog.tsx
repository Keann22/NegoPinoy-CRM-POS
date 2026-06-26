import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { Order } from '@/app/dashboard/orders/page';

interface RevertPendingDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RevertPendingDialog({ order, open, onOpenChange, onSuccess }: RevertPendingDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = useSupabase();
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!order || !supabase) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'Processing',
          not_for_shipping_reason: null,
          boxes_config: null
        })
        .eq('id', order.id);

      if (error) throw error;

      toast({
        title: 'Reverted to Processing',
        description: 'Order sent back to the queue.',
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error reverting order:', error);
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revert to Processing</DialogTitle>
          <DialogDescription>
            Are you sure you want to revert this order back to <strong>Processing</strong>? This will clear its packed boxes and send it back to the queue. Use this if the customer added items or you need to repack it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} variant="destructive">
            {isSubmitting ? 'Reverting...' : 'Yes, Revert to Processing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
