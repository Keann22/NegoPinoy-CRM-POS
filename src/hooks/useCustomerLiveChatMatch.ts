'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import type { ConversationLog, MatchedChatCandidate } from '@/types';

interface UseCustomerLiveChatMatchProps {
  customerId?: string | null;
  fullName?: string | null;
  mobileNumber?: string | null;
  psid?: string | null;
  onLinked?: (psid: string) => void;
}

function isDismissedPair(psid: string, customerId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`negopinoy_dismiss_match_${psid}_${customerId}`) === '1';
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

  useEffect(() => {
    setLinkedPsid(psid || null);
  }, [psid, customerId]);

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
    if (!supabase || !customerId || linkedPsid || (!fullName && !mobileNumber)) {
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
          p_phone: mobileNumber || null,
        });

        if (error) throw error;

        if (!isCancelled && Array.isArray(data)) {
          const filtered = (data as MatchedChatCandidate[]).filter(
            (m) => !isDismissedPair(m.psid, customerId)
          );
          setChatMatches(filtered);
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
  }, [supabase, customerId, linkedPsid, fullName, mobileNumber]);

  const connectChatPsid = useCallback(
    async (targetPsid: string) => {
      if (!supabase || !customerId || !targetPsid) return false;
      setConnectingPsid(targetPsid);
      try {
        const { error } = await supabase.rpc('link_chat_psid_to_customer', {
          p_psid: targetPsid,
          p_customer_id: customerId,
        });

        if (error) throw error;

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
      if (!customerId) return;
      if (typeof window !== 'undefined') {
        localStorage.setItem(`negopinoy_dismiss_match_${targetPsid}_${customerId}`, '1');
      }
      setChatMatches((prev) => prev.filter((m) => m.psid !== targetPsid));
    },
    [customerId]
  );

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
          .select('id, psid, full_name, mobile_number, location_city')
          .not('psid', 'is', null)
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
          }));

        setSearchResults(list);
      } catch (err) {
        console.error('Error searching live chats:', err);
      } finally {
        setIsSearchingChats(false);
      }
    },
    [supabase]
  );

  return {
    linkedPsid,
    recentMessages,
    chatMatches,
    loadingMatches,
    connectingPsid,
    connectChatPsid,
    dismissMatch,
    searchResults,
    isSearchingChats,
    searchLiveChats,
  };
}
