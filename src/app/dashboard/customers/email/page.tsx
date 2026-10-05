'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Mail, Inbox, Send, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCrmEmail } from '@/hooks/useCrmEmail';
import { EmailRecipientSelector } from '@/components/dashboard/crm-email/EmailRecipientSelector';
import { EmailComposer } from '@/components/dashboard/crm-email/EmailComposer';
import { EmailPreview } from '@/components/dashboard/crm-email/EmailPreview';
import { EmailHistoryTable } from '@/components/dashboard/crm-email/EmailHistoryTable';
import { EmailInboxView } from '@/components/dashboard/crm-email/EmailInboxView';

function CrmEmailSenderContent() {
  const searchParams = useSearchParams();
  const targetCustomerId = searchParams.get('customerId');
  const targetEmail = searchParams.get('email');
  const targetName = searchParams.get('name');

  const {
    customers,
    logs,
    threads,
    activeTab,
    setActiveTab,
    activeThread,
    setSelectedThreadEmail,
    replyText,
    setReplyText,
    isLoadingCustomers,
    isLoadingLogs,
    isSending,
    isSyncingInbound,
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
    sendEmail,
    sendReplyToThread,
    syncInboundEmails,
    refreshLogs,
  } = useCrmEmail();

  // Handle URL query parameters for pre-filling
  useEffect(() => {
    if (targetCustomerId && customers.some((c) => c.id === targetCustomerId)) {
      setRecipientMode('single');
      setSelectedCustomerId(targetCustomerId);
    } else if (targetEmail) {
      setRecipientMode('manual');
      setManualEmail(targetEmail);
      if (targetName) setManualName(targetName);
    }
  }, [targetCustomerId, targetEmail, targetName, customers, setRecipientMode, setSelectedCustomerId, setManualEmail, setManualName]);

  const totalUnreadReplies = threads.reduce((acc, t) => acc + t.unreadCount, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="h-8 px-2 -ml-2 text-muted-foreground">
              <Link href="/dashboard/customers">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Customers
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="w-6 h-6 text-primary" />
            CRM Email Hub & Sales Inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            Send promotional email broadcasts and reply directly to customer email replies sent to <strong className="text-foreground">Miss D</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={syncInboundEmails}
            disabled={isSyncingInbound}
            className="gap-1.5 text-xs font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingInbound ? 'animate-spin' : ''}`} />
            {isSyncingInbound ? 'Syncing IMAP...' : 'Sync Email Replies'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'broadcast' | 'inbox')}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="broadcast" className="gap-2 text-xs">
            <Send className="w-3.5 h-3.5" />
            Compose & Broadcast
          </TabsTrigger>
          <TabsTrigger value="inbox" className="gap-2 text-xs relative">
            <Inbox className="w-3.5 h-3.5" />
            Customer Inbox & Replies
            {totalUnreadReplies > 0 && (
              <Badge className="ml-1 px-1.5 py-0 text-[10px] bg-rose-500 text-white">
                {totalUnreadReplies}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Broadcast & Composer */}
        <TabsContent value="broadcast" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-6">
              <EmailRecipientSelector
                recipientMode={recipientMode}
                setRecipientMode={setRecipientMode}
                selectedTier={selectedTier}
                setSelectedTier={setSelectedTier}
                customers={customers}
                selectedCustomerId={selectedCustomerId}
                setSelectedCustomerId={setSelectedCustomerId}
                manualEmail={manualEmail}
                setManualEmail={setManualEmail}
                manualName={manualName}
                setManualName={setManualName}
                tierCounts={tierCounts}
                activeCount={activeRecipients.length}
                isLoading={isLoadingCustomers}
              />

              <EmailComposer
                subject={subject}
                setSubject={setSubject}
                body={body}
                setBody={setBody}
                selectedTemplateId={selectedTemplateId}
                applyTemplate={applyTemplate}
              />
            </div>

            <div className="lg:col-span-5 sticky top-6">
              <EmailPreview
                subject={subject}
                body={body}
                recipients={activeRecipients}
                isSending={isSending}
                onSend={sendEmail}
              />
            </div>
          </div>

          <div className="pt-4">
            <EmailHistoryTable
              logs={logs}
              isLoading={isLoadingLogs}
              onRefresh={refreshLogs}
            />
          </div>
        </TabsContent>

        {/* Tab 2: Customer Email Inbox & Sales Replies */}
        <TabsContent value="inbox" className="pt-4">
          <EmailInboxView
            threads={threads}
            activeThread={activeThread}
            onSelectThread={setSelectedThreadEmail}
            replyText={replyText}
            setReplyText={setReplyText}
            isSending={isSending}
            isSyncing={isSyncingInbound}
            onSendReply={sendReplyToThread}
            onSync={syncInboundEmails}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function CrmEmailSenderPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading Email Hub...</div>}>
      <CrmEmailSenderContent />
    </Suspense>
  );
}
