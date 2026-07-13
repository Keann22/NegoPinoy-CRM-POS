'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { MessageSquare, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { OverdueOrderDialog } from './orders/overdue-order-dialog';
import { PurchaseIssueDialog } from './purchase-issue-dialog';
import type { Order } from '@/types';

export function InboxDrawer() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  
  const [issues, setIssues] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPurchaseIssue, setSelectedPurchaseIssue] = useState<any | null>(null);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);

  const fetchIssues = useCallback(async () => {
    if (!supabase) return;

    // Fetch all open issues (order issues and purchase-receiving issues) and their context
    const { data, error } = await supabase
      .from('order_issues')
      .select(`
        *,
        products(name),
        orders(id, status, customer_id, customers(full_name)),
        purchase_orders(id, notes),
        order_issue_messages(id, sender_name, message, created_at, requires_attention, mentions)
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching issues:', error);
      return;
    }

    setIssues(data || []);
    
    // Calculate unread count (for now, just a dummy value based on active issues)
    // We could track "last_read" but for simplicity, we count issues that have recent messages
    setUnreadCount(data?.length || 0);
  }, [supabase]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  useEffect(() => {
    if (!supabase || !userProfile?.firstName) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();

    const channel = supabase
      .channel('order-issues-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_issue_messages',
        },
        async (payload) => {
          const newMsg = payload.new;
          
          // Refresh issues list to get latest messages
          fetchIssues();

          // Check if this message requires attention
          const isUrgent = newMsg.requires_attention === true;
          const isMentioned = newMsg.mentions && Array.isArray(newMsg.mentions) && newMsg.mentions.some((m: string) => m.toLowerCase() === fullName.toLowerCase());

          // Show urgent toast if marked urgent or mentioned
          if (isUrgent || isMentioned) {
             toast({
               title: "Urgent Order Issue Update",
               description: `${newMsg.sender_name}: ${newMsg.message}`,
               variant: "destructive",
               duration: 15000, // Stay on screen for 15 seconds
             });

             if ('Notification' in window && Notification.permission === 'granted') {
                new Notification("Urgent Order Issue", {
                  body: `${newMsg.sender_name}: ${newMsg.message}`
                });
             }
          } else {
             // Normal toast
             toast({
               title: "New Issue Message",
               description: `${newMsg.sender_name}: ${newMsg.message}`,
               duration: 3000,
             });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userProfile, toast, fetchIssues]);

  const openIssueDialog = async (issue: any) => {
    if (!supabase) return;

    if (issue.issue_type === 'purchase_discrepancy') {
      setSelectedPurchaseIssue(issue);
      setIsPurchaseDialogOpen(true);
      return;
    }

    if (issue.order_id) {
       // Fetch full order to open dialog
       const { data: orderData } = await supabase.from('orders').select('*, customers(full_name)').eq('id', issue.order_id).single();
       if (orderData) {
         setSelectedOrder(orderData as unknown as Order);
         setSelectedCustomerName(orderData.customers?.full_name || 'Unknown Customer');
         setIsDialogOpen(true);
       }
    }
  };

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="relative ml-2 h-8 w-8 bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground">
            <MessageSquare className="h-4 w-4" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-red-500 hover:bg-red-600">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
            <span className="sr-only">Toggle inbox</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" /> Issue Inbox
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {issues.length === 0 ? (
               <div className="text-center text-slate-500 mt-10">No active issues.</div>
            ) : (
               issues.map((issue) => {
                 const messages = issue.order_issue_messages || [];
                 const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                 const isUrgent = lastMessage?.requires_attention;
                 const isPurchaseIssue = issue.issue_type === 'purchase_discrepancy';
                 const batchName = issue.purchase_orders?.notes === 'STAFF_DRAFT'
                   ? 'Pending Staff Requests'
                   : (issue.purchase_orders?.notes || 'Unknown Batch');

                 return (
                   <div
                     key={issue.id}
                     className={`p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors ${isUrgent ? 'border-red-300 bg-red-50 hover:bg-red-100' : 'border-slate-200'}`}
                     onClick={() => openIssueDialog(issue)}
                   >
                     <div className="flex justify-between items-start mb-2">
                       <span className="font-semibold text-sm flex items-center gap-1">
                         {isUrgent && <AlertCircle className="w-4 h-4 text-red-500" />}
                         {isPurchaseIssue ? `PO Shortage - ${batchName}` : `Order #${issue.orders?.id?.substring(0, 7).toUpperCase()}`}
                       </span>
                       <span className="text-[10px] text-slate-500">
                         {lastMessage ? new Date(lastMessage.created_at).toLocaleString() : new Date(issue.created_at).toLocaleString()}
                       </span>
                     </div>
                     <div className="text-xs font-medium text-slate-700 mb-1">
                       {issue.products?.name} - {issue.status}
                     </div>
                     {lastMessage ? (
                       <div className="text-xs text-slate-600 truncate">
                         <span className="font-semibold">{lastMessage.sender_name}:</span> {lastMessage.message}
                       </div>
                     ) : (
                       <div className="text-xs text-slate-400 italic">No messages yet</div>
                     )}
                   </div>
                 );
               })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Render the Issue Dialog when clicked */}
      <OverdueOrderDialog
        order={selectedOrder}
        customerName={selectedCustomerName}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onOrderUpdated={fetchIssues}
      />

      <PurchaseIssueDialog
        issue={selectedPurchaseIssue}
        open={isPurchaseDialogOpen}
        onOpenChange={setIsPurchaseDialogOpen}
        onResolved={fetchIssues}
      />
    </>
  );
}
