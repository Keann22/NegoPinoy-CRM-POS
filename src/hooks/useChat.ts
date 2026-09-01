import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import type { ConversationLog, ChatThread, CustomerDossier, CustomerOrderSummary } from '@/types';

export type ChatFilterTab = 'all' | 'unread' | 'vip' | 'orders';

export function useChat() {
  const supabase = useSupabase();
  const [chatLogs, setChatLogs] = useState<ConversationLog[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [selectedPsid, setSelectedPsid] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<ChatFilterTab>('all');
  const [newMsgPsids, setNewMsgPsids] = useState<Set<string>>(new Set());

  const [customerDetail, setCustomerDetail] = useState<CustomerDossier | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderSummary[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);

  // Fetch initial batch of conversation logs
  const fetchLogs = useCallback(async (silent = false) => {
    if (!supabase) return;
    if (!silent) setLoadingChats(true);
    try {
      const { data, error } = await supabase
        .from('conversation_logs')
        .select('*, customers(full_name, suki_tier, mobile_number)')
        .order('created_at', { ascending: false })
        .limit(2500);

      if (error) throw error;
      setChatLogs(data || []);
    } catch (err) {
      console.error('Failed to fetch conversation logs:', err);
    } finally {
      if (!silent) setLoadingChats(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Realtime subscription for live conversation messages & replies
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('live-chat-stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_logs' },
        async (payload) => {
          const { data: enriched } = await supabase
            .from('conversation_logs')
            .select('*, customers(full_name, suki_tier, mobile_number)')
            .eq('id', payload.new.id)
            .maybeSingle();

          const log: ConversationLog = enriched || (payload.new as ConversationLog);

          setChatLogs((prev) => [log, ...prev.filter((l) => l.id !== log.id)]);

          // If incoming customer message and not currently viewing, mark as unread
          if (log.sender_type === 'customer' && log.customer_psid !== selectedPsid) {
            setNewMsgPsids((prev) => new Set([...prev, log.customer_psid]));
          }
        }
      )
      .subscribe((status) => {
        setIsRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedPsid]);

  // Compile unique conversations / threads
  const threads = useMemo<ChatThread[]>(() => {
    if (!chatLogs || !Array.isArray(chatLogs)) return [];

    const nameMap = new Map<string, { name: string; tier?: string | null }>();
    chatLogs.forEach((l) => {
      const psid = l.customer_psid;
      if (psid && !nameMap.has(psid)) {
        let resolvedName = l.customers?.full_name || l.customer_name;
        if (!resolvedName && l.message_text) {
          const match = l.message_text.match(/(?:complete\s*name|name|pangalan)\s*[:=-]\s*([^\n\r,]+)/i);
          if (match && match[1]?.trim()) {
            resolvedName = match[1].trim();
          }
        }
        if (resolvedName) {
          nameMap.set(psid, { name: resolvedName, tier: l.customers?.suki_tier });
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
          const match = l.message_text.match(/(?:complete\s*name|name|pangalan)\s*[:=-]\s*([^\n\r,]+)/i);
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

  // Active messages for the selected customer thread
  const activeMessages = useMemo(() => {
    if (!selectedPsid || !chatLogs) return [];
    return chatLogs
      .filter((l) => String(l.customer_psid) === String(selectedPsid))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [chatLogs, selectedPsid]);

  // Active thread summary
  const activeThread = useMemo(() => {
    return threads.find((t) => t.psid === selectedPsid) || null;
  }, [threads, selectedPsid]);

  // Select a conversation and clear unread flag
  const selectConversation = useCallback((psid: string) => {
    setSelectedPsid(psid);
    setNewMsgPsids((prev) => {
      const next = new Set(prev);
      next.delete(psid);
      return next;
    });
  }, []);

  // Fetch full customer dossier & past orders when selectedPsid changes
  useEffect(() => {
    if (!selectedPsid || !supabase) {
      setCustomerDetail(null);
      setCustomerOrders([]);
      return;
    }

    let isCancelled = false;
    setLoadingCustomer(true);

    const loadCustomerData = async () => {
      try {
        // 1. Fetch customer details
        const { data: cust } = await supabase
          .from('customers')
          .select('*')
          .eq('psid', selectedPsid)
          .maybeSingle();

        if (isCancelled) return;
        setCustomerDetail(cust || null);

        // 2. Fetch customer orders if customer record exists
        if (cust?.id) {
          const { data: orders } = await supabase
            .from('orders')
            .select('id, order_number, status, total_amount, payment_method, created_at, order_items(product_name, quantity, unit_price)')
            .eq('customer_id', cust.id)
            .order('created_at', { ascending: false })
            .limit(10);

          if (!isCancelled) {
            setCustomerOrders((orders as unknown as CustomerOrderSummary[]) || []);
          }
        } else {
          setCustomerOrders([]);
        }
      } catch (err) {
        console.error('Error fetching customer dossier:', err);
      } finally {
        if (!isCancelled) setLoadingCustomer(false);
      }
    };

    loadCustomerData();

    return () => {
      isCancelled = true;
    };
  }, [selectedPsid, supabase]);

  // Save internal staff notes
  const saveCustomerNotes = useCallback(
    async (notes: string) => {
      if (!customerDetail?.id || !supabase) return;
      setSavingNotes(true);
      try {
        const { error } = await supabase
          .from('customers')
          .update({ ai_summary_notes: notes })
          .eq('id', customerDetail.id);

        if (error) throw error;
        setCustomerDetail((prev) => (prev ? { ...prev, ai_summary_notes: notes } : null));
      } catch (err) {
        console.error('Failed to save customer notes:', err);
      } finally {
        setSavingNotes(false);
      }
    },
    [customerDetail?.id, supabase]
  );

  // Send a manual reply from CRM
  const sendReply = useCallback(
    async (messageText: string) => {
      if (!selectedPsid || !messageText.trim() || !supabase) return;

      try {
        const payload = {
          customer_psid: selectedPsid,
          customer_name: customerDetail?.full_name || activeThread?.fullName || null,
          message_text: messageText.trim(),
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
      } catch (err) {
        console.error('Failed to send reply:', err);
      }
    },
    [selectedPsid, customerDetail?.full_name, activeThread?.fullName, supabase]
  );

  // Update customer details (name, phone, address, etc.)
  const updateCustomer = useCallback(
    async (updates: Partial<CustomerDossier>) => {
      if (!selectedPsid || !supabase) return;
      try {
        if (customerDetail?.id) {
          const { error } = await supabase
            .from('customers')
            .update(updates)
            .eq('id', customerDetail.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('customers')
            .upsert({ psid: selectedPsid, ...updates }, { onConflict: 'psid' });
          if (error) throw error;
        }

        if (updates.full_name) {
          await supabase
            .from('conversation_logs')
            .update({ customer_name: updates.full_name })
            .eq('customer_psid', selectedPsid);
        }

        setCustomerDetail((prev) => ({ ...prev, ...updates }));
        fetchLogs(true);
      } catch (err) {
        console.error('Failed to update customer:', err);
      }
    },
    [selectedPsid, customerDetail?.id, supabase, fetchLogs]
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
    customerDetail,
    customerOrders,
    loadingCustomer,
    savingNotes,
    saveCustomerNotes,
    updateCustomer,
    sendReply,
  };
}

