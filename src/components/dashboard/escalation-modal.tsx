'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, Send } from 'lucide-react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Escalation = {
  messageId: string;
  issueId: string;
  senderName: string;
  message: string;
  createdAt: string;
  requiresAttention: boolean;
  orderId: string | null;
  issueType: string | null;
  productName: string | null;
  customerName: string | null;
  poBatchName: string | null;
};

/** Human label for what the tag is about (order / PO shortage / product / DM). */
function escalationContext(e: Escalation): string {
  if (e.orderId) {
    const short = `Order #${e.orderId.substring(0, 7).toUpperCase()}`;
    return e.customerName ? `${short} · ${e.customerName}` : short;
  }
  if (e.issueType === 'purchase_discrepancy') {
    const batch = e.poBatchName === 'STAFF_DRAFT' ? 'Pending Staff Requests' : e.poBatchName || 'Purchase';
    return `PO Shortage · ${batch}`;
  }
  if (e.productName) return e.productName;
  return 'Message';
}

// How long "I'll handle it later" hides the modal before it re-nags.
const SNOOZE_MS = 5 * 60 * 1000;
// Safety re-check so a snooze eventually lapses even with no realtime traffic.
const RECHECK_MS = 90 * 1000;

/**
 * Forcing modal for tags a user must respond to (see /api/messages/escalations).
 * It is deliberately hard to dismiss — no click-outside / Escape — but it does
 * NOT hard-freeze the app: "I'll handle it later" snoozes it briefly, then it
 * re-pops (and any fresh tag re-pops it immediately) until the user actually
 * replies. Replying is the only thing that clears an escalation.
 */
export function EscalationModal() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();

  const [items, setItems] = useState<Escalation[]>([]);
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const snoozedUntil = useRef(0);
  const wasOpen = useRef(false);

  const myId = userProfile?.id;
  const myName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '';

  const fetchEscalations = useCallback(
    async (opts?: { forceOpen?: boolean }) => {
      if (!myId || !myName) return;
      try {
        const res = await fetch(
          `/api/messages/escalations?userId=${encodeURIComponent(myId)}&userName=${encodeURIComponent(myName)}`
        );
        if (!res.ok) return;
        const body = await res.json();
        const list: Escalation[] = body.escalations || [];
        setItems(list);
        if (list.length === 0) {
          setOpen(false);
          return;
        }
        if (opts?.forceOpen || Date.now() >= snoozedUntil.current) setOpen(true);
      } catch (e) {
        console.error('Error fetching escalations:', e);
      }
    },
    [myId, myName]
  );

  useEffect(() => {
    fetchEscalations();
  }, [fetchEscalations]);

  // Periodic re-check so a lapsed snooze re-nags even without new messages.
  useEffect(() => {
    const t = setInterval(() => fetchEscalations(), RECHECK_MS);
    return () => clearInterval(t);
  }, [fetchEscalations]);

  // A fresh message tagging me forces the modal open and overrides any snooze.
  useEffect(() => {
    if (!supabase || !myId || !myName) return;

    supabase.getChannels()
      .filter((c) => c.topic === 'realtime:escalation-channel')
      .forEach((c) => supabase.removeChannel(c));

    const channel = supabase
      .channel('escalation-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_issue_messages' },
        (payload) => {
          const m = payload.new;
          const mentionsMe =
            Array.isArray(m.mentions) &&
            m.mentions.some((n: string) => (n || '').trim().toLowerCase() === myName.toLowerCase());
          const notMine = (m.sender_name || '').trim().toLowerCase() !== myName.toLowerCase();
          if (mentionsMe && notMine) {
            snoozedUntil.current = 0;
            fetchEscalations({ forceOpen: true });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, myId, myName, fetchEscalations]);

  // Sound + desktop notification the moment the modal transitions into view.
  useEffect(() => {
    if (open && !wasOpen.current && items.length > 0) {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.28);
        }
      } catch {
        /* autoplay may be blocked until a user gesture — the modal still shows */
      }
      if ('Notification' in window && Notification.permission === 'granted') {
        const first = items[0];
        new Notification('Action needed — you were tagged', {
          body: `${first.senderName}: ${first.message}`,
        });
      }
    }
    wasOpen.current = open;
  }, [open, items]);

  const current = items[0] || null;

  const senderRole = () => {
    const roles = userProfile?.roles || [];
    return roles.some((r) => String(r).toLowerCase() === 'sales')
      ? 'sales'
      : roles.some((r) => String(r).toLowerCase() === 'inventory')
      ? 'inventory'
      : 'staff';
  };

  const handleReply = async () => {
    if (!current || !reply.trim() || !myId || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: current.issueId,
          senderId: myId,
          senderName: myName,
          senderRole: senderRole(),
          message: reply.trim(),
          requiresAttention: false,
          mentions: [],
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || 'Failed to send reply');
      }
      setReply('');
      toast({ title: 'Reply sent' });
      await fetchEscalations({ forceOpen: true });
    } catch (e: any) {
      toast({ title: 'Error sending reply', description: e.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const handleLater = () => {
    snoozedUntil.current = Date.now() + SNOOZE_MS;
    setOpen(false);
  };

  if (!current) return null;

  const label = escalationContext(current);
  // Show a product line when the product isn't already the headline label.
  const showProductLine = !!current.productName && current.productName !== label;

  return (
    <Dialog open={open} onOpenChange={() => { /* controlled: only our buttons close it */ }}>
      <DialogContent
        className="max-w-lg border-2 border-red-400 [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" /> Action needed — you were tagged
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {items.length > 1 && (
            <div className="text-xs font-semibold text-red-700">
              {items.length} messages need your reply — showing the oldest.
            </div>
          )}

          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{current.senderName}</span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(current.createdAt).toLocaleString('en-PH', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="text-xs font-medium text-red-800 mb-0.5">Re: {label}</div>
            {showProductLine && (
              <div className="text-xs text-muted-foreground mb-1">Product: {current.productName}</div>
            )}
            <div className="text-sm whitespace-pre-wrap text-red-900 mt-1">{current.message}</div>
            {current.orderId && (
              <Button asChild variant="outline" size="sm" className="mt-2 gap-1">
                <Link href={`/dashboard/orders/${current.orderId}`}>
                  View order <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Your reply (required to clear this)</label>
            <Textarea
              autoFocus
              rows={3}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your reply…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleReply();
                }
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={handleLater} disabled={isSending}>
            I&apos;ll handle it later
          </Button>
          <Button onClick={handleReply} disabled={!reply.trim() || isSending} className="gap-2">
            <Send className="h-4 w-4" />
            {isSending ? 'Sending…' : 'Reply & resolve'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
