import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, PackageOpen, Send, Clock, Activity, MessageSquare, PackageX } from "lucide-react";
import { format, differenceInDays } from "date-fns";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSupabase } from "@/lib/supabase/hooks";
import { useUserProfile } from "@/hooks/useUserProfile";
import { fetchOrderTrail, type OrderTrailEntry } from "@/lib/services/order-trail-service";
import { fanOutStaffNotifications, resolveRecipientNames } from "@/lib/services/staff-message-service";
import { MentionInput } from "@/components/dashboard/mention-input";
import type { Order } from "@/types";

const TRAIL_DOT: Record<OrderTrailEntry['kind'], string> = {
  status: 'bg-indigo-500',
  note: 'bg-slate-400',
  issue_reported: 'bg-red-500',
  issue_message: 'bg-amber-400',
};

const TRAIL_ICON: Record<OrderTrailEntry['kind'], typeof MessageSquare | undefined> = {
  status: undefined,
  note: MessageSquare,
  issue_reported: PackageX,
  issue_message: MessageSquare,
};

interface OverdueOrderDialogProps {
  order: Order | null;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderUpdated: () => void;
  /**
   * 'overdue' (default) shows the red "Overdue Order / N days overdue" header.
   * 'notification' shows a neutral "Order Details" header with the order status
   * instead — used when the same card is opened from a Bell notification, where
   * the order isn't necessarily overdue.
   */
  variant?: 'overdue' | 'notification';
}

export function OverdueOrderDialog({ order, customerName, open, onOpenChange, onOrderUpdated, variant = 'overdue' }: OverdueOrderDialogProps) {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();

  const [replyText, setReplyText] = useState("");
  const [noteMentions, setNoteMentions] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [issues, setIssues] = useState<any[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [localNotes, setLocalNotes] = useState("");
  const [issueReplyText, setIssueReplyText] = useState("");
  const [issueMentions, setIssueMentions] = useState<string[]>([]);
  const [issueIsUrgent, setIssueIsUrgent] = useState(false);
  const [isSendingIssue, setIsSendingIssue] = useState(false);
  const [outOfStockItems, setOutOfStockItems] = useState<{ name: string; quantity: number }[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [trail, setTrail] = useState<OrderTrailEntry[]>([]);
  const [isLoadingTrail, setIsLoadingTrail] = useState(false);

  useEffect(() => {
    if (open && order) {
      setLocalNotes(order.notes || "");
      fetchIssues(order.id);
      fetchLiveStock(order.id);
      loadTrail(order.id);
    } else {
      setIssues([]);
      setReplyText("");
      setNoteMentions([]);
      setIssueReplyText("");
      setIssueMentions([]);
      setOutOfStockItems([]);
      setTrail([]);
    }

  }, [open, order]);

  const loadTrail = async (orderId: string) => {
    if (!supabase) return;
    setIsLoadingTrail(true);
    try {
      setTrail(await fetchOrderTrail(supabase, orderId));
    } catch (e) {
      console.error("Failed to load order trail", e);
    } finally {
      setIsLoadingTrail(false);
    }
  };

  // Independent of order_issues: checks whether the products actually in this order are
  // currently out of stock, even if nobody has formally reported it yet.
  const fetchLiveStock = async (orderId: string) => {
    if (!supabase) return;
    try {
      setIsLoadingStock(true);
      
      // 1. Check if the order has already been picked. If yes, the items are already secured.
      const { data: logData, error: logError } = await supabase
          .from('order_logs')
          .select('id')
          .eq('order_id', orderId)
          .in('status', ['Picked', 'Photo', 'Packed', 'For Shipping', 'For Pick-up'])
          .limit(1);
          
      if (!logError && logData && logData.length > 0) {
        setOutOfStockItems([]);
        return; // Already picked, so it's not out of stock for this customer
      }

      const { data, error } = await supabase
        .from('order_items')
        .select('quantity, product_name, products(name, stock_level)')
        .eq('order_id', orderId);
      if (error) throw error;

      const outOfStock = (data || [])
        .filter((row: any) => row.products?.stock_level !== undefined && row.products?.stock_level !== null && row.products.stock_level <= 0)
        .map((row: any) => ({ name: row.products?.name || row.product_name || 'Unknown product', quantity: row.quantity }));

      setOutOfStockItems(outOfStock);
    } catch (e) {
      console.error("Failed to check live stock for order", e);
    } finally {
      setIsLoadingStock(false);
    }
  };

  const fetchIssues = async (orderId: string) => {
    try {
      setIsLoadingIssues(true);
      const res = await fetch('/api/inventory/issues');
      if (!res.ok) throw new Error('Failed to fetch issues');
      const allIssues = await res.json();
      
      // Filter issues for this specific order
      const orderIssues = (allIssues || []).filter((i: any) => i.orders?.id === orderId);
      
      // Fetch full details for these issues (to get messages)
      const fullIssues = await Promise.all(
        orderIssues.map((i: any) => fetch(`/api/inventory/issues?id=${i.id}`).then(r => r.json()))
      );
      
      setIssues(fullIssues);
    } catch (e) {
      console.error("Failed to load full issues", e);
    } finally {
      setIsLoadingIssues(false);
    }
  };

  const handleSendNote = async () => {
    if (!replyText.trim() || !order || !supabase) return;
    
    setIsSending(true);
    try {
      const senderName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Sales';
      const timestamp = format(new Date(), 'MMM d, yyyy h:mm a');
      const newNoteEntry = `[${timestamp}] ${senderName}:\n${replyText.trim()}`;
      
      const updatedNotes = localNotes ? `${localNotes}\n\n${newNoteEntry}` : newNoteEntry;
      
      const { error } = await supabase
        .from('orders')
        .update({ notes: updatedNotes })
        .eq('id', order.id);
        
      if (error) throw error;

      const recipientNames = resolveRecipientNames(noteMentions, senderName);
      if (recipientNames.length > 0) {
        await fanOutStaffNotifications(supabase, recipientNames, {
          senderName,
          message: replyText.trim(),
          title: `${senderName} tagged you in a note on Order #${order.id.substring(0, 7).toUpperCase()}`,
          link: `/dashboard/orders/${order.id}`,
        });
      }

      setLocalNotes(updatedNotes);
      setReplyText("");
      setNoteMentions([]);
      loadTrail(order.id);
      onOrderUpdated(); // Trigger a refetch in the parent to get the latest notes
    } catch (e: any) {
      alert("Error saving note: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendIssueMessage = async () => {
    if (!issueReplyText.trim() || issues.length === 0 || !supabase) return;
    
    setIsSendingIssue(true);
    try {
      const senderName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Sales';
      const roles = userProfile?.roles || [];
      const isSalesUser = roles.some((r: string) => r.toLowerCase() === 'sales');
      const senderRole = isSalesUser ? 'sales' : 'picker';

      const res = await fetch('/api/inventory/issues/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: issues[0].id, // Send to the first active issue for this order
          senderRole: senderRole,
          senderName: senderName,
          message: issueReplyText,
          requiresAttention: issueIsUrgent,
          mentions: issueMentions
        })
      });

      if (!res.ok) throw new Error('Failed to send message');

      setIssueReplyText("");
      setIssueMentions([]);
      setIssueIsUrgent(false);
      fetchIssues(order!.id);
      loadTrail(order!.id);
    } catch (e: any) {
      alert("Error sending issue message: " + e.message);
    } finally {
      setIsSendingIssue(false);
    }
  };

  if (!order) return null;

  const daysOverdue = order.orderDate ? differenceInDays(new Date(), new Date(order.orderDate)) : 0;
  
  // Flatten all messages from all issues for this order
  const allIssueMessages: any[] = [];
  issues.forEach(issue => {
    if (issue.order_issue_messages) {
      allIssueMessages.push(...issue.order_issue_messages);
    }
  });
  allIssueMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0 bg-slate-50">
        <DialogHeader className="p-6 border-b bg-white shrink-0">
          <div>
            <DialogTitle className="flex items-center gap-2 text-xl">
              {variant === 'overdue' ? (
                <AlertCircle className="text-red-600 w-6 h-6" />
              ) : (
                <PackageOpen className="text-indigo-600 w-6 h-6" />
              )}
              {variant === 'overdue' ? 'Overdue Order:' : 'Order Details:'}{' '}
              <Link href={`/dashboard/orders/${order.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                Order #{order.id.substring(0, 7).toUpperCase()}
              </Link>
            </DialogTitle>
            <div className="flex items-center gap-4 mt-2 pl-8">
              <p className="text-sm font-semibold text-slate-800">
                <Link href={`/dashboard/customers/${order.customerId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                  {customerName}
                </Link>
              </p>
              {variant === 'overdue' ? (
                <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {daysOverdue} days overdue
                </span>
              ) : (
                <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                  {order.orderStatus}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1 pl-8">
              Placed on: <span className="font-medium text-slate-700">{order.orderDate ? format(new Date(order.orderDate), "MMM d, yyyy") : 'Unknown'}</span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left side: Notes Chat */}
          <div className="flex flex-col h-[50vh] md:h-[60vh] border rounded-lg bg-white overflow-hidden shadow-sm">
            <div className="p-3 bg-slate-100 font-semibold text-slate-700 text-sm border-b flex justify-between items-center">
              <span>Order Notes</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {localNotes ? (
                <div className="whitespace-pre-wrap text-sm text-slate-700 font-mono bg-amber-50/50 p-4 rounded-md border border-amber-100 min-h-full">
                  {localNotes}
                </div>
              ) : (
                <div className="text-center text-slate-400 text-sm italic mt-4 flex h-full items-center justify-center">
                  No notes yet. Add one below.
                </div>
              )}
            </div>
            <div className="p-3 bg-slate-50 border-t flex gap-2">
              <MentionInput
                placeholder="Add a note to this order... (@ to tag someone)"
                value={replyText}
                onChange={setReplyText}
                mentions={noteMentions}
                onMentionsChange={setNoteMentions}
                onSubmit={handleSendNote}
              />
              <Button onClick={handleSendNote} disabled={isSending || !replyText.trim()} size="icon" className="bg-indigo-600 hover:bg-indigo-700">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Right side: Order Information & Issues */}
          <div className="flex flex-col h-[50vh] md:h-[60vh] gap-4 overflow-y-auto pr-1">

            {/* Active Issues Box */}
            {isLoadingIssues ? (
               <div className="p-4 bg-white border rounded-lg shadow-sm text-center text-sm text-slate-500">
                 Checking for active issues...
               </div>
            ) : issues.length > 0 ? (
              <div className="flex flex-col border border-red-200 rounded-lg overflow-hidden bg-red-50 shadow-sm shrink-0">
                <div className="p-3 bg-red-100 text-red-800 font-semibold text-sm border-b border-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4"/> {issues.some(i => i.product_id || i.products?.name) ? 'Active Inventory Issue' : 'Manual Order Issue'}
                </div>
                <div className="p-4 overflow-y-auto">
                  {issues.some(i => i.product_id || i.products?.name) && (
                    <div className="mb-4">
                      <span className="text-xs font-semibold text-red-700">Missing Items:</span>
                      <ul className="list-disc pl-4 mt-1 space-y-0.5 text-red-600 text-sm">
                          {issues.filter(i => i.product_id || i.products?.name).map((issue: any) => (
                            <li key={issue.id}>{issue.products?.name || 'Unknown Product'} (x{issue.out_of_stock_qty || 1})</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  
                  {allIssueMessages.length > 0 && (
                    <div className="border-t border-red-200 pt-4">
                      <span className="text-xs font-semibold text-slate-600 mb-2 block">Issue Discussion:</span>
                      <div className="space-y-3">
                        {allIssueMessages.map((msg: any) => {
                          const isSales = msg.sender_role === 'sales';
                          return (
                            <div key={msg.id} className={`flex flex-col ${isSales ? 'items-end' : 'items-start'}`}>
                              <span className="text-[10px] text-slate-500 mb-0.5">{msg.sender_name || (isSales ? 'Sales' : 'Picker')}</span>
                              <div className={`p-2 rounded-lg max-w-[90%] text-xs whitespace-pre-wrap shadow-sm ${isSales ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-red-200 rounded-tl-none text-slate-800'}`}>
                                {msg.message}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="border-t border-red-200 mt-4 pt-3 flex flex-col gap-2">
                    <div className="flex items-center space-x-2 px-1">
                      <Checkbox 
                        id="urgent" 
                        checked={issueIsUrgent} 
                        onCheckedChange={(c) => setIssueIsUrgent(!!c)} 
                      />
                      <Label htmlFor="urgent" className="text-xs font-semibold text-red-700 cursor-pointer">Mark as Urgent / Requires Attention</Label>
                    </div>
                    <div className="flex gap-2">
                      <MentionInput
                        placeholder="Reply to this issue... (@ to tag someone)"
                        value={issueReplyText}
                        onChange={setIssueReplyText}
                        mentions={issueMentions}
                        onMentionsChange={setIssueMentions}
                        onSubmit={handleSendIssueMessage}
                        className="bg-white"
                      />
                      <Button onClick={handleSendIssueMessage} disabled={isSendingIssue || !issueReplyText.trim()} size="icon" className="bg-red-600 hover:bg-red-700">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : outOfStockItems.length > 0 ? (
              <div className="flex flex-col border border-amber-200 rounded-lg overflow-hidden bg-amber-50 shadow-sm">
                <div className="p-3 bg-amber-100 text-amber-800 font-semibold text-sm border-b border-amber-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4"/> Out of Stock (Not Yet Reported)
                </div>
                <div className="p-4">
                  <p className="text-xs text-amber-700 mb-2">
                    No one has filed an inventory issue for this order, but the item(s) below are currently at 0 stock:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-amber-800 text-sm">
                    {outOfStockItems.map((item, idx) => (
                      <li key={idx}>{item.name} (x{item.quantity})</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg shadow-sm text-center text-sm text-green-700">
                {isLoadingStock ? 'Checking current stock…' : 'No active inventory issues reported, and all items in this order are currently in stock.'}
              </div>
            )}

            {/* Order Trail — every comment, note, stock issue, and status change on this order, merged and chronological */}
            <div className="flex flex-col border rounded-lg overflow-hidden bg-white shadow-sm shrink-0">
              <div className="p-3 bg-slate-100 font-semibold text-slate-700 text-sm border-b flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" /> Order Trail
              </div>
              <div className="p-4 max-h-72 overflow-y-auto">
                {isLoadingTrail ? (
                  <div className="text-center text-sm text-slate-400 py-4">Loading trail…</div>
                ) : trail.length === 0 ? (
                  <div className="text-center text-sm text-slate-400 py-4">No trail entries yet.</div>
                ) : (
                  <div className="space-y-4">
                    {trail.map((entry, index) => {
                      const Icon = TRAIL_ICON[entry.kind];
                      return (
                        <div key={entry.id} className="relative pl-5">
                          {index !== trail.length - 1 && (
                            <div className="absolute left-[7px] top-5 bottom-[-16px] w-[2px] bg-slate-200" />
                          )}
                          <div className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm ${TRAIL_DOT[entry.kind]}`} />
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                              {Icon && <Icon className="w-3 h-3 shrink-0" />}
                              {entry.title}
                            </span>
                            <span className="text-[10px] text-slate-500 shrink-0">{format(new Date(entry.createdAt), 'MMM d, h:mm a')}</span>
                          </div>
                          {entry.detail && (
                            <p className="text-xs text-slate-600 whitespace-pre-wrap mt-0.5">{entry.detail}</p>
                          )}
                          {entry.actor && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {entry.kind === 'issue_message' ? 'From' : 'By'}: {entry.actor}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Order Summary Box */}
            <div className="flex flex-col border rounded-lg overflow-hidden bg-white shadow-sm shrink-0">
              <div className="p-3 bg-slate-100 font-semibold text-slate-700 text-sm border-b flex items-center justify-between">
                <span className="flex items-center gap-2"><PackageOpen className="w-4 h-4"/> Order Summary</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="font-medium text-sm">{order.orderStatus}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Total Amount</p>
                    <p className="font-semibold text-sm">₱{(Number(order.totalAmount) || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Payment Type</p>
                    <p className="font-medium text-sm">{order.paymentType}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Sales Person</p>
                  <p className="font-medium text-sm">{order.salesPersonName || 'N/A'}</p>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
