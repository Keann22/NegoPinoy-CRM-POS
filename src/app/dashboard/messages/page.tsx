'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Hash,
  MessageCircle,
  MessageSquarePlus,
  Send,
  User,
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MentionInput } from '@/components/dashboard/mention-input';
import { MessageStaffDialog } from '@/components/dashboard/message-staff-dialog';
import { cn } from '@/lib/utils';

type ThreadMessage = {
  id: string;
  sender_role: string | null;
  sender_name: string | null;
  message: string;
  created_at: string;
  requires_attention: boolean;
  mentions: string[] | null;
};

type Thread = {
  id: string;
  issueType: string;
  status: string;
  orderId: string | null;
  orderStatus: string | null;
  customerName: string | null;
  productName: string | null;
  poBatchName: string | null;
  reportedByName: string | null;
  createdAt: string;
  messages: ThreadMessage[];
  members: { userId: string; displayName: string }[];
  lastActivityAt: string;
  unreadCount: number;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function MessagesPage() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { staff } = useStaffDirectory();
  const { toast } = useToast();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerMentions, setComposerMentions] = useState<string[]>([]);
  const [isUrgent, setIsUrgent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDmPickerOpen, setIsDmPickerOpen] = useState(false);
  const [isNewTopicOpen, setIsNewTopicOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const myName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '';
  const myId = userProfile?.id;

  const threadTitle = useCallback(
    (t: Thread): string => {
      if (t.issueType === 'direct') {
        const other = t.members.find((m) => m.userId !== myId);
        return other?.displayName || 'Direct message';
      }
      if (t.orderId) {
        const short = t.orderId.substring(0, 7).toUpperCase();
        return t.customerName ? `ORD-${short} · ${t.customerName}` : `ORD-${short}`;
      }
      if (t.issueType === 'purchase_discrepancy') {
        const batch = t.poBatchName === 'STAFF_DRAFT' ? 'Pending Staff Requests' : t.poBatchName;
        return `PO Shortage · ${batch || 'Unknown Batch'}`;
      }
      return t.productName || 'Product thread';
    },
    [myId]
  );

  const fetchThreads = useCallback(async () => {
    if (!myId) return;
    try {
      const res = await fetch(
        `/api/messages/threads?userId=${encodeURIComponent(myId)}&userName=${encodeURIComponent(myName)}`
      );
      if (!res.ok) throw new Error('Failed to load threads');
      const body = await res.json();
      setThreads(body.threads || []);
    } catch (e) {
      console.error('Error loading threads:', e);
    } finally {
      setIsLoading(false);
    }
  }, [myId, myName]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const markRead = useCallback(
    (issueId: string) => {
      if (!myId) return;
      setThreads((prev) => prev.map((t) => (t.id === issueId ? { ...t, unreadCount: 0 } : t)));
      fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId, userId: myId, displayName: myName }),
      }).catch((e) => console.error('Error marking thread read:', e));
    },
    [myId, myName]
  );

  useEffect(() => {
    if (!supabase || !myId) return;

    // Guard against a duplicate subscription on the same topic (e.g. React Strict
    // Mode's double-invoke in dev), which throws when .on() is called on a channel
    // that's already past .subscribe().
    supabase.getChannels()
      .filter((c) => c.topic === 'realtime:messages-page-channel')
      .forEach((c) => supabase.removeChannel(c));

    const channel = supabase
      .channel('messages-page-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_issue_messages' },
        (payload) => {
          fetchThreads();
          if (payload.new.issue_id === selectedIdRef.current) {
            markRead(payload.new.issue_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, myId, fetchThreads, markRead]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedId) || null,
    [threads, selectedId]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [selectedId, selectedThread?.messages.length]);

  const orderThreads = useMemo(
    () => threads.filter((t) => t.issueType !== 'direct' && t.status === 'open'),
    [threads]
  );
  const directThreads = useMemo(() => threads.filter((t) => t.issueType === 'direct'), [threads]);
  const resolvedThreads = useMemo(
    () => threads.filter((t) => t.issueType !== 'direct' && t.status !== 'open'),
    [threads]
  );

  const selectThread = (t: Thread) => {
    setSelectedId(t.id);
    setComposerText('');
    setComposerMentions([]);
    setIsUrgent(false);
    markRead(t.id);
  };

  const handleSend = async () => {
    if (!selectedThread || !composerText.trim() || !myId || isSending) return;
    setIsSending(true);
    try {
      const roles = userProfile?.roles || [];
      const senderRole = roles.some((r) => String(r).toLowerCase() === 'sales')
        ? 'sales'
        : roles.some((r) => String(r).toLowerCase() === 'inventory')
        ? 'inventory'
        : 'staff';

      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: selectedThread.id,
          senderId: myId,
          senderName: myName,
          senderRole,
          message: composerText.trim(),
          requiresAttention: isUrgent,
          mentions: composerMentions,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to send message');
      }

      setComposerText('');
      setComposerMentions([]);
      setIsUrgent(false);
      fetchThreads();
    } catch (e: any) {
      toast({ title: 'Error sending message', description: e.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const startDirectMessage = async (other: { id: string; fullName: string }) => {
    if (!myId) return;
    setIsDmPickerOpen(false);
    try {
      const res = await fetch('/api/messages/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: myId,
          userName: myName,
          otherUserId: other.id,
          otherUserName: other.fullName,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to start conversation');
      }
      const { issueId } = await res.json();
      await fetchThreads();
      setSelectedId(issueId);
    } catch (e: any) {
      toast({ title: 'Error starting conversation', description: e.message, variant: 'destructive' });
    }
  };

  const renderThreadRow = (t: Thread) => {
    const last = t.messages[t.messages.length - 1] || null;
    const isSelected = t.id === selectedId;
    const isDirect = t.issueType === 'direct';
    const title = threadTitle(t);

    return (
      <button
        key={t.id}
        onClick={() => selectThread(t)}
        className={cn(
          'w-full text-left px-3 py-2 rounded-md transition-colors flex items-start gap-2',
          isSelected ? 'bg-primary/10' : 'hover:bg-muted'
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
          <span className="flex items-center justify-between gap-2">
            <span className={cn('text-sm truncate', t.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
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
                <span className="font-medium">
                  {(last.sender_name || '').trim().toLowerCase() === myName.toLowerCase() ? 'You' : last.sender_name}
                  :
                </span>{' '}
                {last.message}
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
    <div className="flex h-[calc(100vh-8rem)] min-h-[480px] rounded-lg border bg-background overflow-hidden">
      {/* Left pane: thread list */}
      <div className="w-72 sm:w-80 shrink-0 border-r flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <h1 className="text-base font-semibold flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> Messages
          </h1>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="New message about an order or product" onClick={() => setIsNewTopicOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* DMs come first — the order-thread list below can run to dozens of
              open issues, which would bury private conversations off-screen */}
          <div>
            <div className="px-3 pb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Direct messages
              </span>
              <Popover open={isDmPickerOpen} onOpenChange={setIsDmPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="New direct message">
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Message who?" />
                    <CommandList>
                      <CommandEmpty>No staff found.</CommandEmpty>
                      <CommandGroup>
                        {staff.map((s) => (
                          <CommandItem key={s.id} value={s.fullName} onSelect={() => startDirectMessage(s)}>
                            <span
                              className={cn(
                                'mr-2 h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-semibold',
                                avatarColor(s.fullName)
                              )}
                            >
                              {initials(s.fullName)}
                            </span>
                            <span className="flex flex-col">
                              <span>{s.fullName}</span>
                              {s.roles.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">{s.roles.join(', ')}</span>
                              )}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {directThreads.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground italic">
                No conversations yet. Use + to message someone.
              </div>
            ) : (
              directThreads.map(renderThreadRow)
            )}
          </div>

          <div>
            <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Order threads
            </div>
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
            ) : orderThreads.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground italic">No open threads.</div>
            ) : (
              orderThreads.map(renderThreadRow)
            )}
          </div>

          {resolvedThreads.length > 0 && (
            <Collapsible open={showResolved} onOpenChange={setShowResolved}>
              <CollapsibleTrigger className="w-full px-3 pb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
                {showResolved ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Archive className="h-3 w-3" /> Resolved ({resolvedThreads.length})
              </CollapsibleTrigger>
              <CollapsibleContent>{resolvedThreads.map(renderThreadRow)}</CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>

      {/* Right pane: active thread */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!selectedThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <MessageCircle className="h-10 w-10" />
            <p className="text-sm">Select a thread to start reading.</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {selectedThread.issueType !== 'direct' && <Hash className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <h2 className="text-sm font-semibold truncate">{threadTitle(selectedThread)}</h2>
                  {selectedThread.issueType !== 'direct' && (
                    <Badge variant={selectedThread.status === 'open' ? 'default' : 'secondary'} className="text-[10px]">
                      {selectedThread.status === 'open' ? 'Open' : 'Resolved'}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedThread.issueType === 'direct'
                    ? 'Private conversation'
                    : selectedThread.productName
                    ? `About: ${selectedThread.productName}`
                    : `Started by ${selectedThread.reportedByName || 'system'}`}
                </p>
              </div>

              {selectedThread.members.length > 0 && (
                <div className="hidden sm:flex -space-x-1.5">
                  {selectedThread.members.slice(0, 5).map((m) => (
                    <span
                      key={m.userId}
                      title={m.displayName}
                      className={cn(
                        'h-7 w-7 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-semibold',
                        avatarColor(m.displayName)
                      )}
                    >
                      {initials(m.displayName)}
                    </span>
                  ))}
                  {selectedThread.members.length > 5 && (
                    <span className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[9px] font-semibold">
                      +{selectedThread.members.length - 5}
                    </span>
                  )}
                </div>
              )}

              {selectedThread.orderId && (
                <Button asChild variant="outline" size="sm" className="gap-1 shrink-0">
                  <Link href={`/dashboard/orders/${selectedThread.orderId}`}>
                    View order <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedThread.messages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground mt-8">
                  No messages yet. Say something to get it started.
                </div>
              ) : (
                selectedThread.messages.map((msg) => {
                  const isMine = (msg.sender_name || '').trim().toLowerCase() === myName.toLowerCase();
                  return (
                    <div key={msg.id} className={cn('flex flex-col max-w-[80%]', isMine ? 'items-end ml-auto' : 'items-start')}>
                      <span className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                        {msg.requires_attention && <AlertTriangle className="h-3 w-3 text-red-500" />}
                        {isMine ? 'You' : msg.sender_name}
                        <span>· {new Date(msg.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      </span>
                      <div
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm whitespace-pre-wrap shadow-sm',
                          msg.requires_attention
                            ? 'bg-red-50 border border-red-200 text-red-900'
                            : isMine
                            ? 'bg-primary text-primary-foreground rounded-tr-none'
                            : 'bg-muted rounded-tl-none'
                        )}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t flex items-center gap-2">
              {selectedThread.issueType === 'direct' ? (
                <Input
                  placeholder={`Message ${threadTitle(selectedThread)}...`}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  disabled={isSending}
                />
              ) : (
                <>
                  <MentionInput
                    value={composerText}
                    onChange={setComposerText}
                    mentions={composerMentions}
                    onMentionsChange={setComposerMentions}
                    onSubmit={handleSend}
                    placeholder="Reply... use @ to tag someone"
                    disabled={isSending}
                  />
                  <Button
                    variant={isUrgent ? 'destructive' : 'outline'}
                    size="icon"
                    title={isUrgent ? 'Marked urgent' : 'Mark as urgent'}
                    onClick={() => setIsUrgent((u) => !u)}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button onClick={handleSend} disabled={isSending || !composerText.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      <MessageStaffDialog
        open={isNewTopicOpen}
        onOpenChange={(next) => {
          setIsNewTopicOpen(next);
          if (!next) fetchThreads();
        }}
      />
    </div>
  );
}
