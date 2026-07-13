'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Send, MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUserProfile } from '@/hooks/useUserProfile';

interface StaffMessageThreadDialogProps {
  issue: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function StaffMessageThreadDialog({ issue, open, onOpenChange, onUpdated }: StaffMessageThreadDialogProps) {
  const { userProfile } = useUserProfile();
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    setMessages(issue?.order_issue_messages || []);
  }, [issue]);

  if (!issue) return null;

  const sortedMessages = [...messages].sort(
    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const firstMessage = sortedMessages[0];
  const recipients: string[] = firstMessage?.mentions || [];

  const handleSendReply = async () => {
    if (!replyText.trim()) return;

    setIsSending(true);
    try {
      const senderName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Staff';

      const res = await fetch('/api/inventory/issues/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: issue.id,
          senderRole: 'staff',
          senderName,
          message: replyText.trim(),
          requiresAttention: false,
          mentions: recipients,
        }),
      });

      if (!res.ok) throw new Error('Failed to send reply');

      const refetch = await fetch(`/api/inventory/issues?id=${issue.id}`);
      if (refetch.ok) {
        const fullIssue = await refetch.json();
        setMessages(fullIssue.order_issue_messages || []);
      }
      setReplyText('');
      onUpdated();
    } catch (e: any) {
      alert('Error sending reply: ' + e.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {issue.order_id ? (
              <Link href={`/dashboard/orders/${issue.order_id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                Order #{issue.orders?.id?.substring(0, 7).toUpperCase()}
              </Link>
            ) : (
              <span>{issue.products?.name || 'Product Message'}</span>
            )}
          </DialogTitle>
          {recipients.length > 0 && (
            <p className="text-xs text-muted-foreground">Tagged: {recipients.join(', ')}</p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sortedMessages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground">No messages yet.</div>
          ) : (
            sortedMessages.map((msg: any) => (
              <div key={msg.id} className="flex flex-col items-start">
                <span className="text-[10px] text-muted-foreground mb-0.5">{msg.sender_name}</span>
                <div className="p-2 rounded-lg max-w-[90%] text-sm whitespace-pre-wrap shadow-sm bg-muted rounded-tl-none">
                  {msg.message}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t flex gap-2 shrink-0">
          <Input
            placeholder="Reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
          />
          <Button onClick={handleSendReply} disabled={isSending || !replyText.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
