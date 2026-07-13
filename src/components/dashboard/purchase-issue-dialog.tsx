"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, PackageSearch, Send } from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";

interface PurchaseIssueDialogProps {
  issue: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}

export function PurchaseIssueDialog({ issue, open, onOpenChange, onResolved }: PurchaseIssueDialogProps) {
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const { userProfile } = useUserProfile();

  useEffect(() => {
    setMessages(issue?.order_issue_messages || []);
  }, [issue]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !issue) return;

    setIsSending(true);
    try {
      const senderName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Inventory Staff';
      const res = await fetch('/api/inventory/issues/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: issue.id,
          senderRole: 'inventory',
          senderName,
          message: replyText.trim()
        })
      });

      if (!res.ok) throw new Error('Failed to send message');

      const refetch = await fetch(`/api/inventory/issues?id=${issue.id}`);
      if (refetch.ok) {
        const fullIssue = await refetch.json();
        setMessages(fullIssue.order_issue_messages || []);
      }
      setReplyText("");
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleResolve = async () => {
    if (!issue) return;
    if (!confirm("Mark this purchase issue as resolved?")) return;

    setIsResolving(true);
    try {
      const res = await fetch('/api/inventory/issues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue.id, status: 'resolved' })
      });
      if (!res.ok) throw new Error('Failed to resolve issue');
      onOpenChange(false);
      onResolved();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsResolving(false);
    }
  };

  const batchName = issue?.purchase_orders?.notes === 'STAFF_DRAFT'
    ? 'Pending Staff Requests'
    : (issue?.purchase_orders?.notes || 'Unknown Batch');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setMessages([]); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="p-6 border-b bg-red-50 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl text-red-800">
            <AlertCircle className="w-6 h-6" />
            Purchase Shortage: {issue?.products?.name}
          </DialogTitle>
          <p className="text-sm text-slate-600 mt-1 pl-8 flex items-center gap-1">
            <PackageSearch className="w-3.5 h-3.5" /> Batch: {batchName}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col h-[45vh] border-b">
          <div className="flex-1 overflow-y-auto space-y-4">
            {messages.map((msg: any) => (
              <div key={msg.id} className="flex flex-col items-start">
                <span className="text-xs text-slate-500 mb-1">{msg.sender_name}</span>
                <div className={`p-3 rounded-lg max-w-[85%] text-sm whitespace-pre-wrap shadow-sm border ${msg.requires_attention ? 'bg-red-50 border-red-200 text-red-900' : 'bg-white text-slate-800'}`}>
                  {msg.message}
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="text-sm text-slate-400 italic">No messages yet.</div>
            )}
          </div>
          <div className="pt-3 flex gap-2">
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

        <div className="p-4 flex justify-end shrink-0">
          <Button onClick={handleResolve} disabled={isResolving} variant="outline" className="border-green-600 text-green-700 hover:bg-green-50 gap-2">
            <CheckCircle2 className="w-4 h-4" /> Resolve & Close Issue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
