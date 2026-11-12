'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useChatCustomerDossier } from './useChatCustomerDossier';
import type { ConversationLog, ChatThread } from '@/types';

export type ChatFilterTab = 'all' | 'unread' | 'vip' | 'orders';

let isSyncInFlight = false;

/** The reason an edge function call failed: its JSON `error` when it sent one. */
async function readFunctionError(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = error.context as Response | undefined;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.clone().json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // not JSON
    }
  }
  return error.message;
}

export function useChat(initialPsid?: string | null) {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [chatLogs, setChatLogs] = useState<ConversationLog[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [selectedPsid, setSelectedPsid] = useState<string | null>(initialPsid || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<ChatFilterTab>('all');
  const [newMsgPsids, setNewMsgPsids] = useState<Set<string>>(new Set());
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);

  // Sync selectedPsid if initialPsid from URL query changes
  useEffect(() => {
    if (initialPsid) {
      setSelectedPsid(initialPsid);
    }
  }, [initialPsid]);

  // Fetch initial batch of conversation logs
  const fetchLogs = useCallback(
    async (silent = false) => {
      if (!supabase) return;
      if (!silent) setLoadingChats(true);
      try {
        const { data, error } = await supabase
          .from('conversation_logs')
          .select('*, customers(id, full_name, suki_tier, mobile_number, address_line, city)')
          .order('created_at', { ascending: false })
          .limit(2500);

        if (error) throw error;
        setChatLogs(data || []);
      } catch (err) {
        console.error('Failed to fetch conversation logs:', err);
      } finally {
        if (!silent) setLoadingChats(false);
      }
    },
    [supabase]
  );

  // Fetch logs on mount and periodically sync recent Facebook conversations
  useEffect(() => {
    fetchLogs();
    if (!supabase) return;
    let isCancelled = false;

    // Backstop only: new messages arrive in real time through the webhook + realtime
    // channel. Polling Facebook every few seconds from every open tab risked
    // rate-limiting the page token (which would also block replies).
    const runSync = async () => {
      if (isSyncInFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      isSyncInFlight = true;
      try {
        const { data, error } = await supabase.functions.invoke('facebook-webhook', {
          body: { action: 'sync_messages' },
        });
        if (error) {
          // Background sync is a backstop; log why it failed instead of failing silently
          console.warn('Messenger background sync failed:', await readFunctionError(error));
        }
        if (!isCancelled && data?.insertedCount > 0) {
          fetchLogs(true);
        }
      } catch {
        // Ignore transient background sync errors
      } finally {
        isSyncInFlight = false;
      }
    };

    runSync();
    const interval = setInterval(runSync, 30000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [supabase, fetchLogs]);

  // Realtime subscription for live conversation messages & replies
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('live-chat-stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_logs' },
        async (payload: { new: ConversationLog }) => {
          const { data: enriched } = await supabase
            .from('conversation_logs')
            .select('*, customers(id, full_name, suki_tier, mobile_number, address_line, city)')
            .eq('id', payload.new.id)
            .maybeSingle();

          const log: ConversationLog = (enriched as ConversationLog) || payload.new;

          setChatLogs((prev) => [log, ...prev.filter((l) => l.id !== log.id)]);

          if (log.sender_type === 'customer' && log.customer_psid !== selectedPsid) {
            setNewMsgPsids((prev) => new Set([...prev, log.customer_psid]));
          }
        }
      )
      .subscribe((status: string) => {
        setIsRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedPsid]);

  // Compile unique conversations / threads
  const threads = useMemo<ChatThread[]>(() => {
    if (!chatLogs || !Array.isArray(chatLogs)) return [];

    const nameMap = new Map<
      string,
      { name: string; tier?: string | null; isLinked?: boolean }
    >();

    chatLogs.forEach((l) => {
      const psid = l.customer_psid;
      if (psid && !nameMap.has(psid)) {
        const candidateName =
          l.customers?.full_name ||
          (l.customer_name && !l.customer_name.startsWith('Customer-')
            ? l.customer_name
            : null);
        let resolvedName = candidateName;
        if (!resolvedName && l.message_text) {
          const match = l.message_text.match(
            /(?:complete\s*name|name|pangalan)\s*[:=-]\s*([^\n\r,]+)/i
          );
          if (match && match[1]?.trim()) {
            resolvedName = match[1].trim();
          }
        }
        if (resolvedName) {
          nameMap.set(psid, {
            name: resolvedName,
            tier: l.customers?.suki_tier,
            isLinked: Boolean(l.customers?.address_line || l.customers?.city),
          });
        }
      }
    });

    const threadMap = new Map<string, ChatThread>();
    chatLogs.forEach((l) => {
      const psid = l.customer_psid;
      if (psid && !threadMap.has(psid)) {
        const customerInfo = nameMap.get(psid);
        let resolvedName = customerInfo?.name;

        if (!resolvedName && l.message_text) {
          const match = l.message_text.match(
            /(?:complete\s*name|name|pangalan)\s*[:=-]\s*([^\n\r,]+)/i
          );
          if (match && match[1]?.trim()) {
            resolvedName = match[1].trim();
          }
        }

        resolvedName =
          resolvedName ||
          (psid.startsWith('test') ? 'Customer test' : `Customer-${psid.slice(-4)}`);

        threadMap.set(psid, {
          psid,
          fullName: resolvedName,
          sukiTier: customerInfo?.tier || l.customers?.suki_tier || null,
          lastMessage: l.message_text || '',
          lastDate: l.created_at ? new Date(l.created_at) : new Date(),
          lastSender: l.sender_type,
          unread: newMsgPsids.has(psid),
          isLinkedAccount:
            customerInfo?.isLinked ||
            Boolean(l.customers?.address_line || l.customers?.city),
        });
      }
    });

    return Array.from(threadMap.values());
  }, [chatLogs, newMsgPsids]);

  // Filter threads by search query & filter tab
  const filteredThreads = useMemo(() => {
    let list = threads;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.fullName.toLowerCase().includes(q) ||
          t.psid.toLowerCase().includes(q) ||
          t.lastMessage.toLowerCase().includes(q)
      );
    }

    if (filterTab === 'unread') {
      list = list.filter((t) => t.unread);
    } else if (filterTab === 'vip') {
      list = list.filter((t) => t.sukiTier === 'VIP');
    }

    return list;
  }, [threads, searchQuery, filterTab]);

  // Auto-select first thread if nothing is selected
  useEffect(() => {
    if (!selectedPsid && filteredThreads.length > 0) {
      setSelectedPsid(filteredThreads[0].psid);
    }
  }, [filteredThreads, selectedPsid]);

  // Active messages for the selected customer thread (deduplicated)
  const activeMessages = useMemo(() => {
    if (!selectedPsid || !chatLogs) return [];
    const sorted = chatLogs
      .filter((l) => String(l.customer_psid) === String(selectedPsid))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const deduped: ConversationLog[] = [];
    for (const msg of sorted) {
      const prev = deduped[deduped.length - 1];
      if (
        prev &&
        prev.message_text === msg.message_text &&
        Math.abs(new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) <
          30000
      ) {
        continue;
      }
      deduped.push(msg);
    }
    return deduped;
  }, [chatLogs, selectedPsid]);

  const activeThread = useMemo(() => {
    return threads.find((t) => t.psid === selectedPsid) || null;
  }, [threads, selectedPsid]);

  const selectConversation = useCallback((psid: string) => {
    setSelectedPsid(psid);
    setNewMsgPsids((prev) => {
      const next = new Set(prev);
      next.delete(psid);
      return next;
    });
  }, []);

  const dossier = useChatCustomerDossier({
    selectedPsid,
    threadName: activeThread?.fullName,
    onLogsRefresh: fetchLogs,
  });

  // Send a manual reply from CRM
  const sendReply = useCallback(
    async (messageText: string) => {
      if (!selectedPsid || !messageText.trim() || !supabase) return;
      const trimmedText = messageText.trim();

      try {
        const payload = {
          customer_psid: selectedPsid,
          customer_name: dossier.customerDetail?.full_name || activeThread?.fullName || null,
          message_text: trimmedText,
          sender_type: 'agent',
        };

        const { data, error } = await supabase
          .from('conversation_logs')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;

        if (data) {
          setChatLogs((prev) => [data as ConversationLog, ...prev]);
        }

        const { data: sendData, error: fnError } = await supabase.functions.invoke('facebook-webhook', {
          body: {
            action: 'send_reply',
            psid: selectedPsid,
            text: trimmedText,
          },
        });

        // Record whether Facebook actually delivered it, so a refused reply never looks sent
        const logRow = data as ConversationLog | null;
        const metadata: Record<string, unknown> = { ...(logRow?.metadata ?? {}) };
        if (fnError) {
          const reason = await readFunctionError(fnError);
          metadata.delivery = 'failed';
          metadata.delivery_error = reason;
          toast({
            variant: 'destructive',
            title: 'Not sent to Messenger',
            description: `The customer did not get this reply. Send it from Messenger / Business Suite instead. (${reason})`,
            duration: 15000,
          });
        } else {
          metadata.delivery = 'sent';
          const mid = (sendData as { fbData?: { message_id?: string } } | null)?.fbData?.message_id;
          if (mid) metadata.fb_mid = mid;
        }
        if (logRow?.id) {
          setChatLogs((prev) => prev.map((l) => (l.id === logRow.id ? { ...l, metadata } : l)));
          const { error: markErr } = await supabase
            .from('conversation_logs')
            .update({ metadata })
            .eq('id', logRow.id);
          if (markErr) console.warn('Could not save delivery status:', markErr.message);
        }
      } catch (err) {
        console.error('Failed to send reply:', err);
        toast({
          variant: 'destructive',
          title: 'Reply not sent',
          description: err instanceof Error ? err.message : 'Could not send the reply.',
        });
      }
    },
    [selectedPsid, dossier.customerDetail?.full_name, activeThread?.fullName, supabase, toast]
  );

  return {
    threads: filteredThreads,
    allThreadsCount: threads.length,
    activeThread,
    activeMessages,
    selectedPsid,
    selectConversation,
    searchQuery,
    setSearchQuery,
    filterTab,
    setFilterTab,
    loadingChats,
    refreshChats: fetchLogs,
    isRealtimeActive,
    sendReply,
    ...dossier,
  };
}
