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
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);
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

  const openIssue = async (issue: any) => {
    setSelectedIssue(issue);
    setReplyText("");
    
    // Fetch detailed issue to get messages
    try {
      const res = await fetch(`/api/inventory/issues?id=${issue.id}`);
      if (res.ok) {
        const fullIssue = await res.json();
        setSelectedIssue(fullIssue);
      }
    } catch (e) {
      console.error("Failed to load full issue", e);
    }
  };

  const handleResolve = async () => {
    if (!selectedIssue) return;
    if (!confirm("Are you sure you want to resolve this issue? This will remove it from the dashboard.")) return;
    
    try {
      const res = await fetch('/api/inventory/issues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: selectedIssue.id, status: 'resolved' })
      });
      if (!res.ok) throw new Error("Failed to resolve issue");
      setSelectedIssue(null);
      fetchIssues();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedIssue) return;
    
    setIsSending(true);
    try {
      const res = await fetch('/api/inventory/issues/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: selectedIssue.id,
          senderRole: 'sales',
          senderName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Sales Team',
          message: replyText.trim()
        })
      });
      
      if (!res.ok) throw new Error("Failed to send message");
      
      setReplyText("");
      // Refresh just the messages for this issue
      const refetch = await fetch(`/api/inventory/issues?id=${selectedIssue.id}`);
      if (refetch.ok) {
        const fullIssue = await refetch.json();
        setSelectedIssue(fullIssue);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  if (!isLoading && issues.length === 0) {
    return null; // Don't show anything if there are no issues
  }

  return (
    <>
      <Card className="col-span-4 lg:col-span-4 border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="text-amber-800 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Order Issues ({issues.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-slate-500">Checking for issues...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {issues.map(issue => {
                const reporter = issue.reported_by_name || issue.order_issue_messages?.[0]?.sender_name || 'Unknown';
                const orderTitle = issue.orders ? `Order #${issue.orders.id.substring(0,7).toUpperCase()}` : 'Unknown Order';
                const customerName = issue.orders?.customers?.full_name || '';
                return (
                <div 
                  key={issue.id} 
                  onClick={() => openIssue(issue)}
                  className="bg-white p-4 rounded-md border border-amber-200 shadow-sm cursor-pointer hover:border-amber-400 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm line-clamp-2">
                      {orderTitle}
                    </h4>
                    {customerName && <p className="text-xs text-slate-600 font-medium">{customerName}</p>}
                    <p className="text-xs text-red-600 font-medium mt-1">Missing: {issue.products?.name || 'Unknown Item'}</p>
                    <div className="text-xs text-slate-500 mt-2 space-y-1">
                      <p className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {issue.order_issue_messages?.length || 0} messages
                      </p>
                      <p className="flex items-center gap-1 text-slate-600">
                        Reported by: <span className="font-medium text-slate-800">{reporter}</span>
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full mt-4 text-amber-700 bg-amber-50 hover:bg-amber-100">
                    View Details
                  </Button>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedIssue} onOpenChange={(open) => !open && setSelectedIssue(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="p-6 border-b bg-slate-50 shrink-0">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <AlertCircle className="text-amber-600 w-6 h-6" />
                Order Issue: #{selectedIssue?.orders?.id?.substring(0,7).toUpperCase() || 'Unknown'}
              </DialogTitle>
              <p className="text-sm text-slate-600 mt-1 pl-8">
                Missing Item: <span className="font-medium text-slate-800">{selectedIssue?.products?.name || 'Unknown Item'}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 pl-8">
                Reported by: <span className="font-medium text-slate-700">{selectedIssue?.reported_by_name || 'Unknown'}</span>
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
                {selectedIssue?.order_issue_messages?.map((msg: any) => {
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
                {selectedIssue?.orders ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-500">Customer</p>
                      <p className="font-semibold">{selectedIssue.orders.customers?.full_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Sales Person</p>
                      <p className="font-medium">{selectedIssue.orders.sales_person_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Status</p>
                      <p className="font-medium">{selectedIssue.orders.status}</p>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-slate-500 mb-2">Order Items</p>
                      <ul className="space-y-2">
                        {selectedIssue.orders.order_items?.map((item: any) => (
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
                <CheckCircle2 className="w-4 h-4" /> Resolve & Close Issue
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
