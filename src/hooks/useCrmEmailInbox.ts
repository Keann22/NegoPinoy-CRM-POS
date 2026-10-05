'use client';

import { useState, useMemo, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type {
  CrmEmailRecipient,
  CrmEmailLog,
  CrmEmailThread,
  SendEmailResponse,
} from '@/types/crm-email.types';

export function useCrmEmailInbox(
  logs: CrmEmailLog[],
  customers: CrmEmailRecipient[],
  fetchLogs: () => Promise<void>
) {
  const { toast } = useToast();
  const [isSyncingInbound, setIsSyncingInbound] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [selectedThreadEmail, setSelectedThreadEmail] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const syncInboundEmails = useCallback(async () => {
    setIsSyncingInbound(true);
    try {
      const response = await fetch('/api/crm/sync-inbound-email', { method: 'POST' });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Failed to sync inbound emails');

      toast({
        title: data.syncedCount > 0 ? 'New Replies Synced!' : 'Inbox Up-to-Date',
        description: data.message,
      });

      await fetchLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error syncing inbound emails';
      toast({
        title: 'Sync Warning',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsSyncingInbound(false);
    }
  }, [toast, fetchLogs]);

  const threads = useMemo((): CrmEmailThread[] => {
    const threadMap = new Map<string, CrmEmailLog[]>();

    for (const log of logs) {
      const email = log.recipient_email.toLowerCase();
      if (!threadMap.has(email)) {
        threadMap.set(email, []);
      }
      threadMap.get(email)!.push(log);
    }

    const customerMap = new Map<string, CrmEmailRecipient>();
    for (const c of customers) {
      customerMap.set(c.email.toLowerCase(), c);
    }

    const list: CrmEmailThread[] = [];

    threadMap.forEach((msgList, email) => {
      msgList.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const lastMsg = msgList[msgList.length - 1];
      const matchedCust = customerMap.get(email);
      const unreadCount = msgList.filter((m) => m.direction === 'inbound' && m.status === 'received').length;

      list.push({
        email,
        customerName: matchedCust ? matchedCust.name : lastMsg.recipient_name || 'Customer',
        sukiTier: matchedCust ? matchedCust.sukiTier : 'Customer',
        lastSubject: lastMsg.subject || '(No Subject)',
        lastMessageAt: lastMsg.created_at,
        unreadCount,
        messages: msgList,
      });
    });

    return list.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [logs, customers]);

  const activeThread = useMemo(() => {
    if (!selectedThreadEmail) return threads[0] || null;
    return threads.find((t) => t.email.toLowerCase() === selectedThreadEmail.toLowerCase()) || threads[0] || null;
  }, [threads, selectedThreadEmail]);

  const sendReplyToThread = useCallback(async () => {
    if (!activeThread || !replyText.trim()) return false;

    const recipient: CrmEmailRecipient = {
      id: 'thread-reply',
      name: activeThread.customerName,
      email: activeThread.email,
      sukiTier: activeThread.sukiTier,
    };

    const replySubject = activeThread.lastSubject.startsWith('Re:')
      ? activeThread.lastSubject
      : `Re: ${activeThread.lastSubject}`;

    setIsSendingReply(true);
    try {
      const response = await fetch('/api/crm/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [recipient],
          subject: replySubject,
          body: replyText.trim(),
        }),
      });

      const data: SendEmailResponse = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to send reply');

      toast({
        title: 'Reply Sent!',
        description: `Delivered reply to ${activeThread.customerName} (${activeThread.email}).`,
      });

      setReplyText('');
      await fetchLogs();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reply';
      toast({
        title: 'Reply Failed',
        description: msg,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSendingReply(false);
    }
  }, [activeThread, replyText, toast, fetchLogs]);

  return {
    threads,
    activeThread,
    selectedThreadEmail,
    setSelectedThreadEmail,
    replyText,
    setReplyText,
    isSyncingInbound,
    isSendingReply,
    syncInboundEmails,
    sendReplyToThread,
  };
}
