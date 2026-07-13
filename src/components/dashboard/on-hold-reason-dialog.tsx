'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { Order } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';

interface OnHoldReasonDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function OnHoldReasonDialog({ order, open, onOpenChange, onSuccess }: OnHoldReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();

  const handleConfirm = async () => {
    if (!order || !supabase || !userProfile) return;
    if (reason.trim() === '') {
      toast({ title: 'Reason required', description: 'Please provide a reason for placing this order on hold.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Update order status
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'On-Hold' })
        .eq('id', order.id);
        
      if (orderError) throw orderError;

      // 2. Create Order Issue — but only if this order doesn't already have one
      // open, so re-opening this dialog on an already On-Hold order doesn't
      // pile up duplicate order-level issues (same guard editOrder() uses).
      const { data: existingIssue } = await supabase
        .from('order_issues')
        .select('id')
        .eq('order_id', order.id)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();

      if (!existingIssue) {
        const { data: newIssue, error: issueErr } = await supabase
          .from('order_issues')
          .insert({
            order_id: order.id,
            status: 'open',
            reported_by_name: `${userProfile.firstName} ${userProfile.lastName}`.trim()
          })
          .select('id')
          .single();

        if (issueErr) throw issueErr;

        // 3. Create Issue Message
        if (newIssue) {
          await supabase.from('order_issue_messages').insert({
            issue_id: newIssue.id,
            sender_role: 'sales',
            sender_name: `${userProfile.firstName} ${userProfile.lastName}`.trim(),
            message: `Order was placed On-Hold manually. Reason: ${reason}`
          });
        }
      } else {
        // Already has an open issue — just log the new reason as a message on it.
        await supabase.from('order_issue_messages').insert({
          issue_id: existingIssue.id,
          sender_role: 'sales',
          sender_name: `${userProfile.firstName} ${userProfile.lastName}`.trim(),
          message: `Order placed On-Hold again. Reason: ${reason}`
        });
      }

      toast({ title: 'Order On-Hold', description: 'The order status was updated and an issue was created.' });
      setReason("");
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to place order on hold.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place Order On-Hold</DialogTitle>
          <DialogDescription>
            Why is this order being placed on hold? This will create an issue in the Order Issues dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea 
            placeholder="Enter reason..." 
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[100px]"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isLoading || reason.trim() === ''}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
