'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCrmEmailBroadcast, CRM_EMAIL_TEMPLATES } from '@/hooks/useCrmEmailBroadcast';
import { useCrmEmailInbox } from '@/hooks/useCrmEmailInbox';
import type { CrmEmailRecipient, CrmEmailLog } from '@/types/crm-email.types';

export { CRM_EMAIL_TEMPLATES };

export function useCrmEmail() {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [customers, setCustomers] = useState<CrmEmailRecipient[]>([]);
  const [logs, setLogs] = useState<CrmEmailLog[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'broadcast' | 'inbox'>('broadcast');

  const fetchCustomersWithEmail = useCallback(async () => {
    setIsLoadingCustomers(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, email, suki_tier, mobile_number, total_lifetime_spend')
        .not('email', 'is', null)
        .neq('email', '')
        .order('full_name', { ascending: true });

      if (error) throw error;

      const formatted: CrmEmailRecipient[] = ((data || []) as Array<{
        id: string;
        full_name: string | null;
        email: string;
        suki_tier: string | null;
        mobile_number?: string | null;
        total_lifetime_spend?: number | string | null;
      }>).map((c) => ({
        id: c.id,
        name: c.full_name || 'Customer',
        email: c.email.trim(),
        sukiTier: c.suki_tier || 'NEWBIE',
        phone: c.mobile_number || undefined,
        lifetimeSpend: Number(c.total_lifetime_spend || 0),
      }));

      setCustomers(formatted);
    } catch (err) {
      console.error('Error fetching customers with email:', err);
      toast({
        title: 'Error Loading Customers',
        description: 'Failed to fetch customer email directory.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [supabase, toast]);

  const fetchLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('customer_email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data as CrmEmailLog[]) || []);
    } catch (err) {
      console.error('Error fetching email logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCustomersWithEmail();
    fetchLogs();
  }, [fetchCustomersWithEmail, fetchLogs]);

  const broadcast = useCrmEmailBroadcast(customers, fetchLogs);
  const inbox = useCrmEmailInbox(logs, customers, fetchLogs);

  return {
    customers,
    logs,
    isLoadingCustomers,
    isLoadingLogs,
    activeTab,
    setActiveTab,

    // Broadcast state
    ...broadcast,

    // Inbox state
    ...inbox,
    isSending: broadcast.isSending || inbox.isSendingReply,
    refreshLogs: fetchLogs,
  };
}
