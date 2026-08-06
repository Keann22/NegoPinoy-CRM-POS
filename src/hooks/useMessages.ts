import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
import type { Thread } from '@/types';

export function useMessages() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [composerText, setComposerText] = useState('');
  const [composerMentions, setComposerMentions] = useState<string[]>([]);
  const [isUrgent, setIsUrgent] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const myName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '';
  const myId = userProfile?.id;

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

  const startDirectMessage = async (other: { id: string; fullName: string }, onSuccess?: () => void) => {
    if (!myId) return;
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
      if (onSuccess) onSuccess();
    } catch (e: any) {
      toast({ title: 'Error starting conversation', description: e.message, variant: 'destructive' });
    }
  };

  return {
    threads,
    isLoading,
    selectedId,
    selectedThread,
    orderThreads,
    directThreads,
    resolvedThreads,
    selectThread,
    handleSend,
    startDirectMessage,
    composerText,
    setComposerText,
    composerMentions,
    setComposerMentions,
    isUrgent,
    setIsUrgent,
    isSending,
    fetchThreads,
    myName,
    myId,
  };
}
