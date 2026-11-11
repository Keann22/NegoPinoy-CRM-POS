'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
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

function isDismissedPair(psid: string, customerId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`negopinoy_dismiss_match_${psid}_${customerId}`) === '1';
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
          'id, status, total_amount, balance_due, amount_paid, payment_method, payment_type, order_date, created_at, order_items(product_name, quantity, unit_price, selling_price_at_sale)'
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
            const typedMatches = (matches as MatchedCustomerCandidate[]).filter(
              (m) => !isDismissedPair(selectedPsid, m.id)
            );

            const exactUnlinked = typedMatches.filter(
              (m) => m.match_type === 'exact' && !m.psid
            );

            // Auto-attach PSID when there is a single unambiguous exact match on file
            if (exactUnlinked.length === 1) {
              const target = exactUnlinked[0];
              const { data: mergedCust, error: mergeErr } = await supabase.rpc(
                'link_chat_psid_to_customer',
                {
                  p_psid: selectedPsid,
                  p_customer_id: target.id,
                }
              );

              if (!mergeErr && mergedCust && !isCancelled) {
                cust = mergedCust as CustomerDossier;
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
        const { data: merged, error } = await supabase.rpc('link_chat_psid_to_customer', {
          p_psid: selectedPsid,
          p_customer_id: customerId,
        });

        if (error) throw error;

        toast({
          title: 'Customer Account Connected',
          description: `Live chat is now linked to ${(merged as CustomerDossier)?.full_name || 'the customer account'}.`,
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
    [selectedPsid, supabase, toast, reloadDossier, onLogsRefresh]
  );

  const dismissCandidate = useCallback(
    (customerId: string) => {
      if (!selectedPsid) return;
      if (typeof window !== 'undefined') {
        localStorage.setItem(`negopinoy_dismiss_match_${selectedPsid}_${customerId}`, '1');
      }
      setMatchedCandidates((prev) => prev.filter((c) => c.id !== customerId));
    },
    [selectedPsid]
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
    dismissCandidate,
    reloadDossier,
  };
}
