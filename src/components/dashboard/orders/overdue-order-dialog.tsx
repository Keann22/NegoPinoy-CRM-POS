import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, PackageOpen, Send, Clock } from "lucide-react";
import { format, differenceInDays } from "date-fns";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSupabase } from "@/lib/supabase/hooks";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { Order } from "@/types";

interface OverdueOrderDialogProps {
  order: Order | null;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderUpdated: () => void;
}

export function OverdueOrderDialog({ order, customerName, open, onOpenChange, onOrderUpdated }: OverdueOrderDialogProps) {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();

  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [issues, setIssues] = useState<any[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [localNotes, setLocalNotes] = useState("");
  const [issueReplyText, setIssueReplyText] = useState("");
  const [issueIsUrgent, setIssueIsUrgent] = useState(false);
  const [isSendingIssue, setIsSendingIssue] = useState(false);

  useEffect(() => {
    if (open && order) {
      setLocalNotes(order.notes || "");
      fetchIssues(order.id);
    } else {
      setIssues([]);
      setReplyText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order]);

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
      
      setLocalNotes(updatedNotes);
      setReplyText("");
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
      
      const extractedMentions = issueReplyText.match(/@\w+/g)?.map(m => m.slice(1)) || [];
      
      const res = await fetch('/api/inventory/issues/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: issues[0].id, // Send to the first active issue for this order
          senderRole: senderRole,
          senderName: senderName,
          message: issueReplyText,
          requiresAttention: issueIsUrgent,
          mentions: extractedMentions
        })
      });
      
      if (!res.ok) throw new Error('Failed to send message');
      
      setIssueReplyText("");
      setIssueIsUrgent(false);
      fetchIssues(order!.id);
    } catch (e: any) {
      alert("Error sending issue message: " + e.message);
    } finally {
      setIsSendingIssue(false);
    }
  };

  if (!order) return null;

  const daysOverdue = order.orderDate ? differenceInDays(new Date(), new Date(order.orderDate)) : 0;
  
  // Flatten all messages from all issues for this order
  let allIssueMessages: any[] = [];
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
              <AlertCircle className="text-red-600 w-6 h-6" />
              Overdue Order:{' '}
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
              <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {daysOverdue} days overdue
              </span>
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
              <Input 
                placeholder="Add a note to this order..." 
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendNote()}
              />
              <Button onClick={handleSendNote} disabled={isSending || !replyText.trim()} size="icon" className="bg-indigo-600 hover:bg-indigo-700">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Right side: Order Information & Issues */}
          <div className="flex flex-col h-[50vh] md:h-[60vh] gap-4">
            
            {/* Active Issues Box */}
            {isLoadingIssues ? (
               <div className="p-4 bg-white border rounded-lg shadow-sm text-center text-sm text-slate-500">
                 Checking for active issues...
               </div>
            ) : issues.length > 0 ? (
              <div className="flex flex-col border border-red-200 rounded-lg overflow-hidden bg-red-50 shadow-sm flex-1">
                <div className="p-3 bg-red-100 text-red-800 font-semibold text-sm border-b border-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4"/> Active Inventory Issue
                </div>
                <div className="p-4 overflow-y-auto">
                  <div className="mb-4">
                    <span className="text-xs font-semibold text-red-700">Missing Items:</span>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5 text-red-600 text-sm">
                        {issues.map((issue: any) => (
                          <li key={issue.id}>{issue.products?.name} (x{issue.out_of_stock_qty})</li>
                        ))}
                    </ul>
                  </div>
                  
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
                      <Input 
                        placeholder="Reply to this issue..." 
                        value={issueReplyText}
                        onChange={(e) => setIssueReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendIssueMessage()}
                        className="bg-white"
                      />
                      <Button onClick={handleSendIssueMessage} disabled={isSendingIssue || !issueReplyText.trim()} size="icon" className="bg-red-600 hover:bg-red-700">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg shadow-sm text-center text-sm text-green-700">
                No active inventory issues reported for this order.
              </div>
            )}

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
