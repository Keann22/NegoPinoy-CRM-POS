import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { useSupabase } from "@/lib/supabase/hooks";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useStaffDirectory } from "@/hooks/useStaffDirectory";
import { fetchOrderTrail, type OrderTrailEntry } from "@/lib/services/order-trail-service";
import { fanOutStaffNotifications, resolveRecipientNames } from "@/lib/services/staff-message-service";
import type { Order } from "@/types";

const NOTE_AUTHOR_RE = /^\[[A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} (?:AM|PM)\]\s*(.+?):\s*$/gm;

export function extractNoteParticipants(notes: string, knownFullNames: string[]): string[] {
  const found = new Map<string, string>();

  for (const match of notes.matchAll(NOTE_AUTHOR_RE)) {
    const name = match[1].trim();
    if (name) found.set(name.toLowerCase(), name);
  }

  const lowerNotes = notes.toLowerCase();
  for (const fullName of knownFullNames) {
    const key = fullName.trim().toLowerCase();
    if (key && lowerNotes.includes(`@${key}`)) found.set(key, fullName);
  }

  return [...found.values()];
}

interface UseOverdueOrderDialogProps {
  order: Order | null;
  open: boolean;
  onOrderUpdated: () => void;
}

export function useOverdueOrderDialog({ order, open, onOrderUpdated }: UseOverdueOrderDialogProps) {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { staff } = useStaffDirectory();

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

  const loadTrail = useCallback(async (orderId: string) => {
    if (!supabase) return;
    setIsLoadingTrail(true);
    try {
      setTrail(await fetchOrderTrail(supabase, orderId));
    } catch (e) {
      console.error("Failed to load order trail", e);
    } finally {
      setIsLoadingTrail(false);
    }
  }, [supabase]);

  const fetchLiveStock = useCallback(async (orderId: string) => {
    if (!supabase) return;
    try {
      setIsLoadingStock(true);
      const { data: logData, error: logError } = await supabase
          .from('order_logs')
          .select('id')
          .eq('order_id', orderId)
          .in('status', ['Picked', 'Photo', 'Packed', 'For Shipping', 'For Pick-up'])
          .limit(1);
          
      if (!logError && logData && logData.length > 0) {
        setOutOfStockItems([]);
        return;
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
  }, [supabase]);

  const fetchIssues = useCallback(async (orderId: string) => {
    try {
      setIsLoadingIssues(true);
      const res = await fetch('/api/inventory/issues');
      if (!res.ok) throw new Error('Failed to fetch issues');
      const allIssues = await res.json();
      
      const orderIssues = (allIssues || []).filter((i: any) => i.orders?.id === orderId);
      
      const fullIssues = await Promise.all(
        orderIssues.map((i: any) => fetch(`/api/inventory/issues?id=${i.id}`).then(r => r.json()))
      );
      
      setIssues(fullIssues);
    } catch (e) {
      console.error("Failed to load full issues", e);
    } finally {
      setIsLoadingIssues(false);
    }
  }, []);

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
  }, [open, order, fetchIssues, fetchLiveStock, loadTrail]);

  const handleSendNote = async () => {
    if (!replyText.trim() || !order || !supabase) return;
    
    setIsSending(true);
    try {
      const senderName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Sales';
      const timestamp = format(new Date(), 'MMM d, yyyy h:mm a');
      const newNoteEntry = `[${timestamp}] ${senderName}:\n${replyText.trim()}`;
      const updatedNotes = localNotes ? `${localNotes}\n\n${newNoteEntry}` : newNoteEntry;
      
      const { error } = await supabase.from('orders').update({ notes: updatedNotes }).eq('id', order.id);
      if (error) throw error;

      const orderRef = `Order #${order.id.substring(0, 7).toUpperCase()}`;
      const link = `/dashboard/orders/${order.id}`;

      const taggedNames = resolveRecipientNames(noteMentions, senderName);
      const knownFullNames = staff.map((s) => s.fullName);
      const threadParticipants = resolveRecipientNames(
        extractNoteParticipants(localNotes, knownFullNames),
        senderName
      );
      const taggedKeys = new Set(taggedNames.map((n) => n.toLowerCase()));
      const groupNames = threadParticipants.filter((n) => !taggedKeys.has(n.toLowerCase()));

      if (taggedNames.length > 0) {
        await fanOutStaffNotifications(supabase, taggedNames, {
          senderName,
          message: replyText.trim(),
          title: `${senderName} tagged you in a note on ${orderRef}`,
          link,
        });
      }
      if (groupNames.length > 0) {
        await fanOutStaffNotifications(supabase, groupNames, {
          senderName,
          message: replyText.trim(),
          title: `${senderName} replied on ${orderRef}`,
          link,
        });
      }

      setLocalNotes(updatedNotes);
      setReplyText("");
      setNoteMentions([]);
      loadTrail(order.id);
      onOrderUpdated();
    } catch (e: any) {
      alert("Error saving note: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendIssueMessage = async () => {
    if (!issueReplyText.trim() || issues.length === 0 || !supabase || !order) return;
    
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
          issueId: issues[0].id,
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
      fetchIssues(order.id);
      loadTrail(order.id);
    } catch (e: any) {
      alert("Error sending issue message: " + e.message);
    } finally {
      setIsSendingIssue(false);
    }
  };

  const allIssueMessages: any[] = [];
  issues.forEach(issue => {
    if (issue.order_issue_messages) {
      allIssueMessages.push(...issue.order_issue_messages);
    }
  });
  allIssueMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return {
    replyText, setReplyText,
    noteMentions, setNoteMentions,
    isSending,
    issues, isLoadingIssues,
    localNotes,
    issueReplyText, setIssueReplyText,
    issueMentions, setIssueMentions,
    issueIsUrgent, setIssueIsUrgent,
    isSendingIssue,
    outOfStockItems, isLoadingStock,
    trail, isLoadingTrail,
    handleSendNote,
    handleSendIssueMessage,
    allIssueMessages
  };
}
