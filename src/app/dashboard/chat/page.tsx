'use client';

import React from 'react';
import { RefreshCw, MessageSquare } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { ChatSidebar } from '@/components/dashboard/chat/ChatSidebar';
import { ChatMessageThread } from '@/components/dashboard/chat/ChatMessageThread';
import { ChatComposer } from '@/components/dashboard/chat/ChatComposer';
import { CustomerProfilePanel } from '@/components/dashboard/chat/CustomerProfilePanel';
import { AddOrderDialog } from '@/components/dashboard/order-dialog';

export default function ChatHistoryPage() {
  const {
    threads,
    activeThread,
    activeMessages,
    selectedPsid,
    selectConversation,
    searchQuery,
    setSearchQuery,
    filterTab,
    setFilterTab,
    loadingChats,
    refreshChats,
    isRealtimeActive,
    customerDetail,
    customerOrders,
    loadingCustomer,
    savingNotes,
    saveCustomerNotes,
    updateCustomer,
    sendReply,
  } = useChat();

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] max-w-[1600px] mx-auto py-3 px-2 sm:px-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Live Chat & CRM</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Pancake Mode
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Unified omnichannel live chat stream, instant replies, and customer dossier.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <AddOrderDialog />
          <button
            type="button"
            onClick={() => refreshChats()}
            disabled={loadingChats}
            className="p-2 bg-card hover:bg-muted border border-border text-foreground rounded-xl transition-all shadow-2xs disabled:opacity-50"
            title="Refresh conversations"
          >
            <RefreshCw className={`w-4 h-4 ${loadingChats ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* 3-Column Pancake Command Center */}
      <div className="flex-1 bg-card border border-border rounded-3xl overflow-hidden shadow-xl flex min-h-0">
        {/* Col 1: Left Conversations Sidebar */}
        <ChatSidebar
          threads={threads}
          selectedPsid={selectedPsid}
          onSelect={selectConversation}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterTab={filterTab}
          onFilterChange={setFilterTab}
          loading={loadingChats}
          isRealtimeActive={isRealtimeActive}
        />

        {/* Col 2: Middle Chat Stream & Composer */}
        <div className="flex-1 flex flex-col min-w-0 bg-background h-full">
          {selectedPsid ? (
            <>
              <ChatMessageThread
                thread={activeThread}
                messages={activeMessages}
                customerDetail={customerDetail}
              />
              <ChatComposer onSendMessage={sendReply} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
              <h3 className="font-bold text-sm text-foreground">Select a conversation</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Choose a conversation from the left sidebar to start chatting.
              </p>
            </div>
          )}
        </div>

        {/* Col 3: Right Customer CRM Profile & Orders Dossier */}
        <CustomerProfilePanel
          psid={selectedPsid}
          customerDetail={customerDetail}
          orders={customerOrders}
          loading={loadingCustomer}
          savingNotes={savingNotes}
          onSaveNotes={saveCustomerNotes}
          onUpdateCustomer={updateCustomer}
        />
      </div>
    </div>
  );
}
