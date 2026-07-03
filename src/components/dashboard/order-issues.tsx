import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, MessageSquare, PackageOpen, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/supabase/hooks";
import { useUserProfile } from "@/hooks/useUserProfile";

export function OrderIssues({ isAdmin }: { isAdmin?: boolean }) {
  const [issues, setIssues] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  
  const { user } = useUser();
  const { userProfile } = useUserProfile();
  const canResolve = userProfile?.roles?.some(r => ['Admin', 'Owner', 'Sales'].includes(r));

  const fetchIssues = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/inventory/issues');
      if (!res.ok) throw new Error('Failed to fetch issues');
      const data = await res.json();
      setIssues(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedIssues = Object.values(issues.reduce((acc, issue) => {
    const orderId = issue.orders?.id || 'unknown';
    if (!acc[orderId]) {
      acc[orderId] = {
        orderId,
        orderTitle: issue.orders ? `Order #${issue.orders.id.substring(0,7).toUpperCase()}` : 'Unknown Order',
        customerName: issue.orders?.customers?.full_name || '',
        reporter: issue.reported_by_name || issue.order_issue_messages?.[0]?.sender_name || 'Unknown',
        items: [],
        messagesCount: 0,
        issues: [],
        orders: issue.orders
      };
    }
    const itemLabel = issue.products?.name || 'Unknown Item';
    acc[orderId].items.push(issue.out_of_stock_qty ? `${itemLabel} (x${issue.out_of_stock_qty})` : itemLabel);
    acc[orderId].messagesCount += (issue.order_issue_messages?.length || 0);
    acc[orderId].issues.push(issue);
    return acc;
  }, {} as Record<string, any>));

  const openGroup = async (group: any) => {
    setSelectedGroup(group);
    setReplyText("");
    
    // Fetch detailed issues to get all messages
    try {
      const fullGroupIssues = await Promise.all(
          group.issues.map((i: any) => fetch(`/api/inventory/issues?id=${i.id}`).then(res => res.json()))
      );
      
      let allMessages: any[] = [];
      fullGroupIssues.forEach(fullIssue => {
          if (fullIssue.order_issue_messages) {
              allMessages.push(...fullIssue.order_issue_messages);
          }
      });
      allMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setSelectedGroup({
         ...group,
         issues: fullGroupIssues,
         messages: allMessages
      });
    } catch (e) {
      console.error("Failed to load full issues", e);
    }
  };

  const handleResolve = async () => {
    if (!selectedGroup) return;
    if (!confirm("Are you sure you want to resolve ALL issues for this order? This will remove them from the dashboard.")) return;
    
    try {
      for (const issue of selectedGroup.issues) {
          const res = await fetch('/api/inventory/issues', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ issueId: issue.id, status: 'resolved' })
          });
          if (!res.ok) throw new Error("Failed to resolve an issue");
      }
      setSelectedGroup(null);
      fetchIssues();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedGroup) return;
    
    setIsSending(true);
    try {
      // Send message attached to the first issue in the group
      const res = await fetch('/api/inventory/issues/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: selectedGroup.issues[0].id,
          senderRole: 'sales',
          senderName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Sales Team',
          message: replyText.trim()
        })
      });
      
      if (!res.ok) throw new Error("Failed to send message");
      
      setReplyText("");
      // Refresh the group
      openGroup(selectedGroup);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Card className="col-span-4 lg:col-span-4 border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="text-amber-800 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Order Issues ({issues.length} items across {groupedIssues.length} orders)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-slate-500">Checking for issues...</div>
          ) : groupedIssues.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center bg-white rounded border border-amber-100">
              No active order issues at the moment.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {groupedIssues.map((group: any) => (
                <div 
                  key={group.orderId} 
                  onClick={() => openGroup(group)}
                  className="bg-white p-4 rounded-md border border-amber-200 shadow-sm cursor-pointer hover:border-amber-400 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm line-clamp-2">
                      {group.orderTitle}
                    </h4>
                    {group.customerName && <p className="text-xs text-slate-600 font-medium">{group.customerName}</p>}
                    <div className="mt-2 space-y-1">
                        <p className="text-xs font-semibold text-red-600">Missing Items ({group.items.length}):</p>
                        <ul className="text-xs text-red-500 list-disc pl-4 space-y-0.5">
                            {group.items.slice(0, 3).map((item: string, idx: number) => (
                                <li key={idx} className="truncate">{item}</li>
                            ))}
                            {group.items.length > 3 && <li>+{group.items.length - 3} more</li>}
                        </ul>
                    </div>
                    <div className="text-xs text-slate-500 mt-3 space-y-1 pt-3 border-t border-slate-100">
                      <p className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {group.messagesCount} messages
                      </p>
                      <p className="flex items-center gap-1 text-slate-600">
                        Reported by: <span className="font-medium text-slate-800">{group.reporter}</span>
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full mt-4 text-amber-700 bg-amber-50 hover:bg-amber-100">
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="p-6 border-b bg-slate-50 shrink-0">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <AlertCircle className="text-amber-600 w-6 h-6" />
                Order Issue: {selectedGroup?.orderTitle}
              </DialogTitle>
              <div className="text-sm text-slate-600 mt-2 pl-8">
                <span className="font-semibold text-slate-800">Missing Items:</span>
                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-red-600">
                    {selectedGroup?.items?.map((item: string, idx: number) => (
                        <li key={idx}>{item}</li>
                    ))}
                </ul>
              </div>
              <p className="text-xs text-slate-500 mt-2 pl-8">
                Reported by: <span className="font-medium text-slate-700">{selectedGroup?.reporter || 'Unknown'}</span>
              </p>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left side: Chat */}
            <div className="flex flex-col h-[50vh] md:h-[60vh] border rounded-lg bg-slate-50 overflow-hidden">
              <div className="p-3 bg-slate-200/50 font-semibold text-slate-700 text-sm border-b">
                Discussion
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedGroup?.messages?.map((msg: any) => {
                  const isSales = msg.sender_role === 'sales';
                  return (
                    <div key={msg.id} className={`flex flex-col ${isSales ? 'items-end' : 'items-start'}`}>
                      <span className="text-xs text-slate-500 mb-1">{msg.sender_name || (isSales ? 'Sales' : 'Picker')}</span>
                      <div className={`p-3 rounded-lg max-w-[85%] text-sm whitespace-pre-wrap shadow-sm ${isSales ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border rounded-tl-none text-slate-800'}`}>
                        {msg.message}
                      </div>
                    </div>
                  );
                })}
                {selectedGroup?.messages?.length === 0 && (
                    <div className="text-center text-slate-400 text-sm italic mt-4">No messages yet.</div>
                )}
              </div>
              <div className="p-3 bg-white border-t flex gap-2">
                <Input 
                  placeholder="Type a reply..." 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                />
                <Button onClick={handleSendReply} disabled={isSending || !replyText.trim()} size="icon" className="bg-indigo-600 hover:bg-indigo-700">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Right side: Order Information */}
            <div className="flex flex-col h-[50vh] md:h-[60vh] border rounded-lg overflow-hidden bg-white">
              <div className="p-3 bg-slate-100 font-semibold text-slate-700 text-sm border-b flex items-center justify-between">
                <span className="flex items-center gap-2"><PackageOpen className="w-4 h-4"/> Order Details</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {selectedGroup?.orders ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-500">Customer</p>
                      <p className="font-semibold">{selectedGroup.orders.customers?.full_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Sales Person</p>
                      <p className="font-medium">{selectedGroup.orders.sales_person_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Status</p>
                      <p className="font-medium">{selectedGroup.orders.status}</p>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-slate-500 mb-2">Order Items</p>
                      <ul className="space-y-2">
                        {selectedGroup.orders.order_items?.map((item: any) => (
                          <li key={item.id} className="text-sm flex justify-between">
                            <span>{item.product_name}</span>
                            <span className="font-bold">x{item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-slate-500">No order details found.</div>
                )}
              </div>
            </div>
          </div>

          {canResolve && (
            <div className="p-4 border-t bg-slate-50 flex justify-end shrink-0">
              <Button onClick={handleResolve} variant="outline" className="border-amber-600 text-amber-700 hover:bg-amber-50 gap-2">
                <CheckCircle2 className="w-4 h-4" /> Resolve ALL Missing Items
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
