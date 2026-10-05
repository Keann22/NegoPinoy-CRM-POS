'use client';

import { useState, useMemo, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type {
  CrmEmailRecipient,
  CrmEmailTemplate,
  SendEmailResponse,
} from '@/types/crm-email.types';

export const CRM_EMAIL_TEMPLATES: CrmEmailTemplate[] = [
  {
    id: 'vip-promo',
    name: 'VIP Exclusive Promo',
    description: 'Special discount offer for VIP Suki customers',
    subject: 'Special VIP Perk for You, {{name}}! 🎁',
    body: `Kumusta {{name}}!

Bilang isa sa aming pinahahalagahang {{tier}} suki sa NegoPinoy, may espesyal kaming regalo para sa susunod mong order.

Gamitin lamang ang code: SUKIVIP10 para makakuha ng 10% discount sa iyong susunod na pagbili!

Maraming salamat sa iyong tuluy-tuloy na tiwala sa amin. Kung may anumang items kang kailangan para sa iyong negosyo, huwag mag-atubiling mag-reply dito.

Lubos na gumagalang,
Ang NegoPinoy Team`,
  },
  {
    id: 'order-followup',
    name: 'Order & Delivery Follow-up',
    description: 'Check in on order satisfaction and condition',
    subject: 'Kamusta ang iyong order, {{name}}? 📦',
    body: `Magandang araw {{name}},

Nais lamang naming kamustahin ang iyong pinakahuling order mula sa NegoPinoy. Nakarating ba ito nang maayos at kumpleto?

Kung mayroon kang anumang katanungan, feedback, o kailangan ng tulong sa paggamit ng produkto, masaya kaming tulungan ka.

I-reply lamang dito o kontakin ang aming customer support.

Maraming salamat!
NegoPinoy Support Team`,
  },
  {
    id: 'payment-reminder',
    name: 'Payment Reminder / Statement',
    description: 'Friendly reminder for pending balance or invoice',
    subject: 'Friendly Reminder: Pending Account Balance - {{name}}',
    body: `Hello {{name}},

Magandang araw! Nais lamang po naming magbigay ng magalang na paalala patungkol sa iyong pending balance sa iyong NegoPinoy account.

Maaari mong bayaran ito sa pamamagitan ng GCash, Maya, o Bank Transfer. Pakipasa lamang po ang kopya ng inyong receipt pagkatapos magbayad para ma-update agad ang inyong account record.

Kung nakabayad na po kayo, paki-ignore lamang ang mensaheng ito.

Salamat sa inyong kooperasyon!
NegoPinoy Accounting Team`,
  },
  {
    id: 'suki-appreciation',
    name: 'Suki Customer Appreciation',
    description: 'Thank you message to maintain customer loyalty',
    subject: 'Maraming Salamat mula sa NegoPinoy, {{name}}! ⭐',
    body: `Dearest {{name}},

Isang taos-pusong pasasalamat mula sa buong pamilya ng NegoPinoy!

Ang inyong suporta bilang isang tapat na {{tier}} customer ang nagbibigay-buhay sa aming misyon na maghatid ng pinakamahusay na serbisyo at gamit pangnegosyo.

Asahan ninyo ang patuloy naming pagpapabuti ng aming mga produkto at serbisyo para sa inyo.

Mabuhay ang inyong negosyo!
NegoPinoy CRM Team`,
  },
];

export function useCrmEmailBroadcast(customers: CrmEmailRecipient[], fetchLogs: () => Promise<void>) {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);

  const [recipientMode, setRecipientMode] = useState<'tier' | 'single' | 'manual'>('tier');
  const [selectedTier, setSelectedTier] = useState<'all' | 'vip' | 'regular' | 'newbie'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');

  const [subject, setSubject] = useState(CRM_EMAIL_TEMPLATES[0].subject);
  const [body, setBody] = useState(CRM_EMAIL_TEMPLATES[0].body);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(CRM_EMAIL_TEMPLATES[0].id);

  const tierCounts = useMemo(() => {
    const counts = { all: customers.length, vip: 0, regular: 0, newbie: 0 };
    for (const c of customers) {
      const t = (c.sukiTier || '').toLowerCase();
      if (t === 'vip') counts.vip++;
      else if (t === 'regular') counts.regular++;
      else counts.newbie++;
    }
    return counts;
  }, [customers]);

  const activeRecipients = useMemo((): CrmEmailRecipient[] => {
    if (recipientMode === 'tier') {
      if (selectedTier === 'all') return customers;
      return customers.filter((c) => (c.sukiTier || '').toLowerCase() === selectedTier.toLowerCase());
    }
    if (recipientMode === 'single') {
      const match = customers.find((c) => c.id === selectedCustomerId);
      return match ? [match] : [];
    }
    if (recipientMode === 'manual') {
      if (!manualEmail.trim()) return [];
      return [
        {
          id: 'manual',
          name: manualName.trim() || 'Valued Customer',
          email: manualEmail.trim(),
          sukiTier: 'Customer',
        },
      ];
    }
    return [];
  }, [recipientMode, selectedTier, customers, selectedCustomerId, manualEmail, manualName]);

  const applyTemplate = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = CRM_EMAIL_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setSubject(tmpl.subject);
      setBody(tmpl.body);
    }
  }, []);

  const sendEmail = useCallback(async () => {
    if (activeRecipients.length === 0) {
      toast({
        title: 'No Recipients',
        description: 'Please select or specify at least one valid recipient.',
        variant: 'destructive',
      });
      return false;
    }

    if (!subject.trim() || !body.trim()) {
      toast({
        title: 'Missing Content',
        description: 'Subject and body cannot be empty.',
        variant: 'destructive',
      });
      return false;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/crm/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: activeRecipients,
          subject,
          body,
        }),
      });

      const data: SendEmailResponse = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to dispatch email');

      toast({
        title: 'Email(s) Dispatched!',
        description: data.message,
      });

      await fetchLogs();
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error sending email';
      toast({
        title: 'Send Error',
        description: errMsg,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSending(false);
    }
  }, [activeRecipients, subject, body, toast, fetchLogs]);

  return {
    recipientMode,
    setRecipientMode,
    selectedTier,
    setSelectedTier,
    selectedCustomerId,
    setSelectedCustomerId,
    manualEmail,
    setManualEmail,
    manualName,
    setManualName,
    subject,
    setSubject,
    body,
    setBody,
    selectedTemplateId,
    applyTemplate,
    activeRecipients,
    tierCounts,
    isSending,
    sendEmail,
  };
}
