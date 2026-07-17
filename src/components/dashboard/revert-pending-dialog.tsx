import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Order } from '@/app/dashboard/orders/page';
import { Package, PackageOpen } from 'lucide-react';

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
  const { userProfile } = useUserProfile();

  const handleSubmit = async (releaseStock: boolean) => {
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

      if (releaseStock) {
        // If they chose to release the stock, reset all items in this order to is_packed = false
        const { error: itemsError } = await supabase
          .from('order_items')
          .update({ is_packed: false })
          .eq('order_id', order.id);
          
        if (itemsError) {
          console.error('Failed to release stock on order_items:', itemsError);
        }
      }

      const userName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Unknown Staff';
      const logStatus = releaseStock ? 'Reverted to Processing (Stock Released)' : 'Reverted to Processing (Stock Kept)';
      
      const { error: logError } = await supabase.from('order_logs').insert({
        order_id: order.id,
        status: logStatus,
        user_name: userName,
      });

      if (logError) {
        console.error('Failed to insert order log:', logError);
      }

      toast({
        title: 'Reverted to Processing',
        description: releaseStock ? 'Order sent back to queue and stock released.' : 'Order sent back to queue (stock kept).',
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revert to Processing</DialogTitle>
          <DialogDescription>
            Are you sure you want to revert this order back to <strong>Processing</strong>? This will clear its packed boxes and send it back to the queue.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          <Button 
            onClick={() => handleSubmit(false)} 
            disabled={isSubmitting} 
            variant="outline"
            className="flex flex-col items-start h-auto p-4 gap-2 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-900 hover:border-indigo-300 transition-colors"
          >
            <div className="flex items-center gap-2 font-semibold text-base">
              <Package className="h-5 w-5" />
              Keep Stock in Box
            </div>
            <div className="text-sm font-normal text-slate-500 text-left whitespace-normal">
              Use this if you are just adding items or editing details. The items will <strong>not</strong> show up in Procurement.
            </div>
          </Button>

          <Button 
            onClick={() => handleSubmit(true)} 
            disabled={isSubmitting} 
            variant="outline"
            className="flex flex-col items-start h-auto p-4 gap-2 border-orange-200 hover:bg-orange-50 hover:text-orange-900 hover:border-orange-300 transition-colors"
          >
            <div className="flex items-center gap-2 font-semibold text-base">
              <PackageOpen className="h-5 w-5" />
              Release Stock to Warehouse
            </div>
            <div className="text-sm font-normal text-slate-500 text-left whitespace-normal">
              Use this if you are taking the items out to give to someone else. The items <strong>will</strong> show up in Procurement again.
            </div>
          </Button>
        </div>

        <DialogFooter className="mt-2 sm:justify-start">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="w-full">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
