'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import {
  chatLinkErrorMessage,
  dismissChatMatch,
  linkChatToCustomerWithConfirm,
  unlinkChatFromCustomer,
} from '@/lib/services/chat-link-service';
import type { ConversationLog, MatchedChatCandidate } from '@/types';

interface UseCustomerLiveChatMatchProps {
  customerId?: string | null;
  fullName?: string | null;
  mobileNumber?: string | null;
  psid?: string | null;
  onLinked?: (psid: string) => void;
}

export function useCustomerLiveChatMatch({
  customerId,
  fullName,
  mobileNumber,
  psid,
  onLinked,
}: UseCustomerLiveChatMatchProps) {
  const supabase = useSupabase();
  const { toast } = useToast();

  const [linkedPsid, setLinkedPsid] = useState<string | null>(psid || null);
  const [recentMessages, setRecentMessages] = useState<ConversationLog[]>([]);
  const [chatMatches, setChatMatches] = useState<MatchedChatCandidate[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [connectingPsid, setConnectingPsid] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<MatchedChatCandidate[]>([]);
  const [isSearchingChats, setIsSearchingChats] = useState(false);
  // Phone on file, read from the database (callers like the order form don't always pass it)
  const [dbMobile, setDbMobile] = useState<string | null>(null);
  const [linkReady, setLinkReady] = useState(false);

  // The customer's real Messenger link comes from the database, not from props:
  // the order form passes a customer object without psid, which used to make a
  // linked customer look unlinked and offer to connect another chat.
  useEffect(() => {
    setLinkedPsid(psid || null);
    setDbMobile(null);
    setLinkReady(false);
    if (!supabase || !customerId) return;
    let isCancelled = false;
    supabase
      .from('customers')
      .select('psid, mobile_number')
      .eq('id', customerId)
      .maybeSingle()
      .then(({ data }: { data: { psid: string | null; mobile_number: string | null } | null }) => {
        if (isCancelled) return;
        if (data) {
          setLinkedPsid(data.psid || null);
          setDbMobile(data.mobile_number || null);
        }
        setLinkReady(true);
      });
    return () => {
      isCancelled = true;
    };
  }, [supabase, psid, customerId]);

  const phoneForMatch = mobileNumber || dbMobile;

  // If customer already has a linked PSID, fetch their recent Messenger conversation preview
  useEffect(() => {
    if (!supabase || !linkedPsid) {
      setRecentMessages([]);
      return;
    }

    let isCancelled = false;
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('conversation_logs')
        .select('id, customer_psid, customer_name, message_text, sender_type, created_at')
        .eq('customer_psid', linkedPsid)
        .order('created_at', { ascending: false })
        .limit(4);

      if (!isCancelled && data) {
        setRecentMessages([...(data as ConversationLog[])].reverse());
      }
    };

    fetchRecent();
    return () => {
      isCancelled = true;
    };
  }, [supabase, linkedPsid]);

  // If customer does NOT have a linked PSID yet, check Live Chat for matching customer names/phones
  useEffect(() => {
    if (!supabase || !customerId || !linkReady || linkedPsid || (!fullName && !phoneForMatch)) {
      setChatMatches([]);
      return;
    }

    let isCancelled = false;
    setLoadingMatches(true);

    const checkMatches = async () => {
      try {
        const { data, error } = await supabase.rpc('find_matching_chats_for_customer', {
          p_customer_id: customerId,
          p_name: fullName || null,
          p_phone: phoneForMatch || null,
        });

        if (error) throw error;

        // "Not the same person" pairs are already left out by the database
        if (!isCancelled && Array.isArray(data)) {
          setChatMatches(data as MatchedChatCandidate[]);
        }
      } catch (err) {
        console.error('Failed to check Live Chat matches for customer:', err);
      } finally {
        if (!isCancelled) setLoadingMatches(false);
      }
    };

    checkMatches();
    return () => {
      isCancelled = true;
    };
  }, [supabase, customerId, linkReady, linkedPsid, fullName, phoneForMatch]);

  const connectChatPsid = useCallback(
    async (targetPsid: string) => {
      if (!supabase || !customerId || !targetPsid) return false;
      setConnectingPsid(targetPsid);
      try {
        const result = await linkChatToCustomerWithConfirm(supabase, targetPsid, customerId, fullName ?? null);
        if (result.status !== 'linked') {
          throw new Error(chatLinkErrorMessage(result) || 'Failed to connect Live Chat.');
        }

        setLinkedPsid(targetPsid);
        setChatMatches([]);
        toast({
          title: 'Live Chat Connected!',
          description: `${fullName || 'Customer'} is now connected to their Messenger Live Chat.`,
        });
        onLinked?.(targetPsid);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to connect Live Chat.';
        toast({
          variant: 'destructive',
          title: 'Connection Failed',
          description: msg,
        });
        return false;
      } finally {
        setConnectingPsid(null);
      }
    },
    [supabase, customerId, fullName, toast, onLinked]
  );

  const dismissMatch = useCallback(
    (targetPsid: string) => {
      if (!customerId || !supabase) return;
      setChatMatches((prev) => prev.filter((m) => m.psid !== targetPsid));
      dismissChatMatch(supabase, targetPsid, customerId).catch((err) => {
        console.error('Failed to save "not the same person":', err);
      });
    },
    [customerId, supabase]
  );

  const disconnectChat = useCallback(async () => {
    if (!supabase || !customerId || !linkedPsid) return false;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Disconnect the Messenger chat from ${fullName || 'this customer'}?

Anything the link moved goes back to the chat's own record.`
      )
    ) {
      return false;
    }
    setConnectingPsid(linkedPsid);
    try {
      const result = await unlinkChatFromCustomer(supabase, customerId);
      if (!result.ok) throw new Error(result.message);
      setLinkedPsid(null);
      setRecentMessages([]);
      toast({ title: 'Chat disconnected', description: 'The Messenger chat is no longer linked to this account.' });
      return true;
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Disconnect failed',
        description: err instanceof Error ? err.message : 'Could not disconnect the chat.',
      });
      return false;
    } finally {
      setConnectingPsid(null);
    }
  }, [supabase, customerId, linkedPsid, fullName, toast]);

  const searchLiveChats = useCallback(
    async (query: string) => {
      if (!supabase || query.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearchingChats(true);
      try {
        const q = query.trim();
        const { data } = await supabase
          .from('customers')
          .select('id, psid, full_name, mobile_number, location_city, store_credit, orders(count)')
          .not('psid', 'is', null)
          .neq('id', customerId || '00000000-0000-0000-0000-000000000000')
          .ilike('full_name', `%${q}%`)
          .limit(8);

        const list: MatchedChatCandidate[] = ((data as Record<string, unknown>[]) || [])
          .filter((row) => Boolean(row.psid))
          .map((row) => ({
            psid: String(row.psid),
            chat_customer_id: String(row.id),
            chat_customer_name: String(row.full_name || `Customer-${String(row.psid).slice(-4)}`),
            mobile_number: (row.mobile_number as string) || null,
            location_city: (row.location_city as string) || null,
            match_type: 'manual',
            chat_order_count: Number((row.orders as { count?: number }[] | undefined)?.[0]?.count ?? 0),
            chat_store_credit: Number(row.store_credit ?? 0),
          }));

        setSearchResults(list);
      } catch (err) {
        console.error('Error searching live chats:', err);
      } finally {
        setIsSearchingChats(false);
      }
    },
    [supabase, customerId]
  );

  return {
    linkedPsid,
    recentMessages,
    chatMatches,
    loadingMatches,
    connectingPsid,
    connectChatPsid,
    dismissMatch,
    disconnectChat,
    searchResults,
    isSearchingChats,
    searchLiveChats,
  };
}
