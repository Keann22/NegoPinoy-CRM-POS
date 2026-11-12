'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import {
  chatLinkErrorMessage,
  dismissChatMatch,
  isAutoLinkSafe,
  linkChatToCustomer,
  linkChatToCustomerWithConfirm,
  unlinkChatFromCustomer,
} from '@/lib/services/chat-link-service';
import type {
  CustomerDossier,
  CustomerOrderSummary,
  MatchedCustomerCandidate,
} from '@/types';

interface UseChatCustomerDossierProps {
  selectedPsid: string | null;
  threadName?: string | null;
  onLogsRefresh: (silent?: boolean) => Promise<void>;
}

export function useChatCustomerDossier({
  selectedPsid,
  threadName,
  onLogsRefresh,
}: UseChatCustomerDossierProps) {
  const supabase = useSupabase();
  const { toast } = useToast();

  const [customerDetail, setCustomerDetail] = useState<CustomerDossier | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderSummary[]>([]);
  const [matchedCandidates, setMatchedCandidates] = useState<MatchedCustomerCandidate[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const reloadDossier = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!selectedPsid || !supabase) {
      setCustomerDetail(null);
      setCustomerOrders([]);
      setMatchedCandidates([]);
      return;
    }

    let isCancelled = false;
    setLoadingCustomer(true);

    const fetchOrdersForCustomer = async (customerId: string): Promise<CustomerOrderSummary[]> => {
      const { data: orders, error } = await supabase
        .from('orders')
        .select(
          'id, status, total_amount, balance_due, amount_paid, payment_method, order_date, created_at, order_items(product_name, quantity, unit_price, selling_price_at_sale)'
        )
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(15);

      if (error) {
        console.error('Error fetching customer orders in chat:', error);
        return [];
      }
      return (orders as unknown as CustomerOrderSummary[]) || [];
    };

    const loadCustomerData = async () => {
      try {
        let { data: cust } = await supabase
          .from('customers')
          .select('*')
          .eq('psid', selectedPsid)
          .maybeSingle();

        if (isCancelled) return;

        let ordersList: CustomerOrderSummary[] = [];
        if (cust?.id) {
          ordersList = await fetchOrdersForCustomer(cust.id);
        }

        if (isCancelled) return;

        const hasFullAccount = Boolean(
          cust?.address_line || cust?.city || ordersList.length > 0
        );

        const candidateName = cust?.full_name || threadName || null;
        const candidatePhone = cust?.mobile_number || null;

        // Check for matching POS accounts on file when this PSID is not yet linked to a full account
        if (!hasFullAccount && (candidateName || candidatePhone)) {
          const { data: matches } = await supabase.rpc('find_matching_customers_for_chat', {
            p_psid: selectedPsid,
            p_name: candidateName,
            p_phone: candidatePhone,
          });

          if (!isCancelled && Array.isArray(matches) && matches.length > 0) {
            // "Not the same person" pairs are already left out by the database
            const typedMatches = matches as MatchedCustomerCandidate[];

            // Auto-link only when phone AND name agree, and only one account does.
            // Name-only or phone-only matches are shown for staff to confirm.
            const safeMatches = typedMatches.filter((m) => !m.psid && isAutoLinkSafe(m));

            if (safeMatches.length === 1) {
              const target = safeMatches[0];
              const linked = await linkChatToCustomer(supabase, selectedPsid, target.id, {
                method: 'auto_phone_name',
              });

              if (linked.status === 'linked' && !isCancelled) {
                cust = linked.customer as unknown as CustomerDossier;
                ordersList = cust.id ? await fetchOrdersForCustomer(cust.id) : [];
                setMatchedCandidates(
                  typedMatches.filter((m) => m.id !== target.id)
                );
                onLogsRefresh(true);
              } else {
                setMatchedCandidates(typedMatches);
              }
            } else {
              setMatchedCandidates(typedMatches);
            }
          } else if (!isCancelled) {
            setMatchedCandidates([]);
          }
        } else {
          setMatchedCandidates([]);
        }

        if (!isCancelled) {
          setCustomerDetail(cust || null);
          setCustomerOrders(ordersList);
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
  }, [selectedPsid, threadName, supabase, refreshTick, onLogsRefresh]);

  const linkToCustomerAccount = useCallback(
    async (customerId: string) => {
      if (!selectedPsid || !supabase) return false;
      setLinkingAccount(true);
      try {
        const targetName = matchedCandidates.find((c) => c.id === customerId)?.full_name ?? null;
        const result = await linkChatToCustomerWithConfirm(supabase, selectedPsid, customerId, targetName);
        const failure = chatLinkErrorMessage(result);
        if (result.status !== 'linked') throw new Error(failure || 'Could not link customer account.');
        const merged = result.customer as unknown as CustomerDossier;

        toast({
          title: 'Customer Account Connected',
          description: `Live chat is now linked to ${merged?.full_name || 'the customer account'}.`,
        });

        setMatchedCandidates((prev) => prev.filter((c) => c.id !== customerId));
        reloadDossier();
        await onLogsRefresh(true);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not link customer account.';
        console.error('Failed to link chat to customer account:', err);
        toast({
          variant: 'destructive',
          title: 'Link Failed',
          description: msg,
        });
        return false;
      } finally {
        setLinkingAccount(false);
      }
    },
    [selectedPsid, supabase, toast, reloadDossier, onLogsRefresh, matchedCandidates]
  );

  const unlinkAccount = useCallback(async () => {
    if (!supabase || !customerDetail?.id) return false;
    const name = customerDetail.full_name || 'this account';
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Disconnect this Messenger chat from ${name}?

Anything the link moved goes back to the chat's own record.`)
    ) {
      return false;
    }
    setLinkingAccount(true);
    try {
      const result = await unlinkChatFromCustomer(supabase, customerDetail.id);
      if (!result.ok) throw new Error(result.message);
      toast({ title: 'Chat disconnected', description: `Messenger chat is no longer linked to ${name}.` });
      reloadDossier();
      await onLogsRefresh(true);
      return true;
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Disconnect failed',
        description: err instanceof Error ? err.message : 'Could not disconnect the chat.',
      });
      return false;
    } finally {
      setLinkingAccount(false);
    }
  }, [supabase, customerDetail?.id, customerDetail?.full_name, toast, reloadDossier, onLogsRefresh]);

  const dismissCandidate = useCallback(
    (customerId: string) => {
      if (!selectedPsid || !supabase) return;
      setMatchedCandidates((prev) => prev.filter((c) => c.id !== customerId));
      dismissChatMatch(supabase, selectedPsid, customerId).catch((err) => {
        console.error('Failed to save "not the same person":', err);
      });
    },
    [selectedPsid, supabase]
  );

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
        reloadDossier();
        await onLogsRefresh(true);
      } catch (err) {
        console.error('Failed to update customer:', err);
      }
    },
    [selectedPsid, customerDetail?.id, supabase, reloadDossier, onLogsRefresh]
  );

  return {
    customerDetail,
    customerOrders,
    matchedCandidates,
    loadingCustomer,
    linkingAccount,
    savingNotes,
    saveCustomerNotes,
    updateCustomer,
    linkToCustomerAccount,
    unlinkAccount,
    dismissCandidate,
    reloadDossier,
  };
}
