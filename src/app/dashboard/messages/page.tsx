'use client';

import { useState } from 'react';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { MessageStaffDialog } from '@/components/dashboard/message-staff-dialog';
import { useMessages } from '@/hooks/useMessages';
import { MessagesSidebar } from '@/components/dashboard/messages/MessagesSidebar';
import { ActiveThreadView } from '@/components/dashboard/messages/ActiveThreadView';

export default function MessagesPage() {
  const { staff } = useStaffDirectory();
  const [isNewTopicOpen, setIsNewTopicOpen] = useState(false);

  const {
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
  } = useMessages();

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[480px] rounded-lg border bg-background overflow-hidden">
      <MessagesSidebar
        isLoading={isLoading}
        orderThreads={orderThreads}
        directThreads={directThreads}
        resolvedThreads={resolvedThreads}
        selectedId={selectedId}
        myId={myId}
        staff={staff}
        onSelectThread={selectThread}
        onStartDirectMessage={startDirectMessage}
        onOpenNewTopic={() => setIsNewTopicOpen(true)}
      />

      <ActiveThreadView
        selectedThread={selectedThread}
        myName={myName}
        isSending={isSending}
        composerText={composerText}
        setComposerText={setComposerText}
        composerMentions={composerMentions}
        setComposerMentions={setComposerMentions}
        isUrgent={isUrgent}
        setIsUrgent={setIsUrgent}
        onSend={handleSend}
      />

      <MessageStaffDialog
        open={isNewTopicOpen}
        onOpenChange={(next) => {
          setIsNewTopicOpen(next);
          if (!next) fetchThreads();
        }}
      />
    </div>
  );
}
