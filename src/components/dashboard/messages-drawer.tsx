'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/hooks';
import { MessageCircle, AlertCircle, Hash, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { avatarColor, initials, threadTitle } from '@/lib/utils/messages';
import { cn } from '@/lib/utils';
import type { Thread } from '@/types';

/**
 * Header inbox for the messaging center — DMs and message threads only.
 *
 * This is intentionally distinct from the Notification Bell: the bell carries
 * system/order notifications (the `notifications` table), while this drawer is
 * exclusively conversations (order_issues threads the user belongs to, with
 * their real per-thread unread counts). Clicking a thread jumps to the full
 * Messages page.
 */
export function MessagesDrawer() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);

  const myId = userProfile?.id;
  const myName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '';

  const fetchThreads = useCallback(async () => {
    if (!myId) return;
    try {
      const res = await fetch(
        `/api/messages/threads?userId=${encodeURIComponent(myId)}&userName=${encodeURIComponent(myName)}`
      );
      if (!res.ok) throw new Error('Failed to load threads');
      const body = await res.json();
      setThreads(body.threads || []);
      setTotalUnread(body.totalUnread || 0);
    } catch (err) {
      console.error('Error loading message threads:', err);
    }
  }, [myId, myName]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads, pathname]);

  useEffect(() => {
    if (!supabase || !myId) return;

    // Guard against a duplicate subscription on the same topic (e.g. React Strict
    // Mode's double-invoke in dev), which throws when .on() is called on a channel
    // that's already past .subscribe().
    supabase.getChannels()
      .filter((c) => c.topic === 'realtime:messages-drawer-channel')
      .forEach((c) => supabase.removeChannel(c));

    const channel = supabase
      .channel('messages-drawer-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_issue_messages' },
        async (payload) => {
          const msg = payload.new;

          // Always refresh the list/badge so counts stay live.
          fetchThreads();

          // Only alert for messages from someone else, and only in threads the
          // current user is actually a member of (covers DMs and threads they've
          // been looped into) — never toast the whole team like the old inbox.
          if (!msg.sender_name || msg.sender_name === myName) return;

          const { data: membership } = await supabase
            .from('thread_participants')
            .select('issue_id')
            .eq('issue_id', msg.issue_id)
            .eq('user_id', myId)
            .eq('is_member', true)
            .maybeSingle();
          if (!membership) return;

          const isUrgent = msg.requires_attention === true;
          toast({
            title: isUrgent ? `Urgent message from ${msg.sender_name}` : `New message from ${msg.sender_name}`,
            description: msg.message,
            variant: isUrgent ? 'destructive' : undefined,
            duration: isUrgent ? 15000 : 4000,
          });

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`New message from ${msg.sender_name}`, { body: msg.message });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, myId, myName, fetchThreads, toast]);

  const openMessages = () => {
    // Close the Sheet first so Radix releases its scroll/pointer lock cleanly,
    // then navigate — leaving the Sheet open across a route change can strand a
    // `pointer-events: none` lock on <body> and freeze the next page.
    setOpen(false);
    router.push('/dashboard/messages');
  };

  const directThreads = threads.filter((t) => t.issueType === 'direct');
  const otherThreads = threads.filter((t) => t.issueType !== 'direct' && t.status === 'open');

  const renderThreadRow = (t: Thread) => {
    const last = t.messages[t.messages.length - 1] || null;
    const isDirect = t.issueType === 'direct';
    const title = threadTitle(t, myId);
    const isUrgent = last?.requires_attention;

    return (
      <button
        key={t.id}
        onClick={openMessages}
        className={cn(
          'w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-2',
          isUrgent ? 'border-red-300 bg-red-50 hover:bg-red-100' : 'border-slate-200 hover:bg-slate-50'
        )}
      >
        {isDirect ? (
          <span
            className={cn(
              'mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold',
              avatarColor(title)
            )}
          >
            {initials(title) || <User className="h-3.5 w-3.5" />}
          </span>
        ) : (
          <Hash className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2 mb-0.5">
            <span className={cn('text-sm truncate flex items-center gap-1', t.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
              {isUrgent && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
              {title}
            </span>
            {t.unreadCount > 0 && (
              <Badge className="h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] bg-red-500 hover:bg-red-600 shrink-0">
                {t.unreadCount > 9 ? '9+' : t.unreadCount}
              </Badge>
            )}
          </span>
          <span className="block text-xs text-muted-foreground truncate">
            {last ? (
              <>
                <span className="font-medium">{last.sender_name}:</span> {last.message}
              </>
            ) : (
              <span className="italic">No messages yet</span>
            )}
          </span>
        </span>
      </button>
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative ml-2 h-8 w-8 bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground">
          <MessageCircle className="h-4 w-4" />
          {totalUnread > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-red-500 hover:bg-red-600">
              {totalUnread > 9 ? '9+' : totalUnread}
            </Badge>
          )}
          <span className="sr-only">Toggle messages</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" /> Messages
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2 px-1">
              Direct messages
            </div>
            {directThreads.length === 0 ? (
              <div className="text-xs text-muted-foreground italic px-1">No conversations yet.</div>
            ) : (
              <div className="space-y-2">{directThreads.map(renderThreadRow)}</div>
            )}
          </div>

          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2 px-1">
              Order &amp; issue threads
            </div>
            {otherThreads.length === 0 ? (
              <div className="text-xs text-muted-foreground italic px-1">No open threads.</div>
            ) : (
              <div className="space-y-2">{otherThreads.map(renderThreadRow)}</div>
            )}
          </div>
        </div>
        <div className="p-4 border-t">
          <Button className="w-full" onClick={openMessages}>
            Open Messages
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
