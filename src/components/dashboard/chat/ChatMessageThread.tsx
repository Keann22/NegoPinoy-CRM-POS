'use client';

import React, { useRef, useEffect } from 'react';
import { Bot, User, ShieldCheck, ShoppingCart, MessageSquare, Image as ImageIcon } from 'lucide-react';
import { ChatAvatar } from './ChatSidebar';
import type { ConversationLog, ChatThread, CustomerDossier } from '@/types';

interface ChatMessageThreadProps {
  thread: ChatThread | null;
  messages: ConversationLog[];
  customerDetail: CustomerDossier | null;
  onOpenOrderDialog?: () => void;
}

export function ChatMessageThread({
  thread,
  messages,
  customerDetail,
  onOpenOrderDialog,
}: ChatMessageThreadProps) {
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!thread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-background">
        <div className="w-16 h-16 rounded-3xl bg-muted/40 flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-muted-foreground/60" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">Select a Conversation</h3>
        <p className="text-xs max-w-xs text-muted-foreground">
          Choose a conversation from the left sidebar to view message history and customer profile.
        </p>
      </div>
    );
  }

  const displayName = customerDetail?.full_name || thread.fullName;

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0 h-full">
      {/* Top Header */}
      <div className="px-5 py-3.5 border-b border-border bg-card/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <ChatAvatar name={displayName} psid={thread.psid} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-foreground truncate">{displayName}</h3>
              {thread.sukiTier && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    thread.sukiTier === 'VIP'
                      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/20'
                      : 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                  }`}
                >
                  {thread.sukiTier}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
              <span>PSID: {thread.psid}</span>
              {customerDetail?.location_city && (
                <>
                  <span>•</span>
                  <span className="font-sans">📍 {customerDetail.location_city}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action button */}
        {onOpenOrderDialog && (
          <button
            onClick={onOpenOrderDialog}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Create Order</span>
          </button>
        )}
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No messages logged for this customer.
          </div>
        ) : (
          messages.map((msg, index) => {
            const senderType = msg.sender_type || '';
            const isCustomer = senderType === 'customer';
            const isBot = senderType === 'bot';
            const isAdmin = senderType === 'agent' || senderType === 'admin';
            const isAttachment = msg.message_text?.startsWith('[Sent an attachment:');

            const timeStr = msg.created_at
              ? new Date(msg.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';

            return (
              <div
                key={msg.id || index}
                className={`flex gap-3 items-end ${isCustomer ? 'justify-start' : 'justify-end'}`}
              >
                {isCustomer && (
                  <ChatAvatar name={displayName} psid={thread.psid} size={28} />
                )}

                <div
                  className={`max-w-[78%] md:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-xs ${
                    isCustomer
                      ? 'bg-card border border-border text-foreground rounded-bl-xs'
                      : isBot
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 rounded-br-xs font-mono'
                      : 'bg-blue-600 text-white rounded-br-xs'
                  }`}
                >
                  {/* Bubble Header */}
                  <div
                    className={`flex items-center justify-between gap-4 mb-1 text-[10px] ${
                      isAdmin ? 'text-white/80' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="font-bold uppercase tracking-wider flex items-center gap-1">
                      {isCustomer ? (
                        <>
                          <User className="w-3 h-3" />
                          <span>{displayName}</span>
                        </>
                      ) : isBot ? (
                        <>
                          <Bot className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Ate AI (Observer)</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3 h-3" />
                          <span>Admin / Staff</span>
                        </>
                      )}
                    </span>
                    <span className="text-[10px] opacity-80">{timeStr}</span>
                  </div>

                  {/* Bubble Content */}
                  {isAttachment ? (
                    <div className="flex items-center gap-2 py-1 italic opacity-90">
                      <ImageIcon className="w-4 h-4" />
                      <span>{msg.message_text}</span>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed select-text">
                      {msg.message_text}
                    </p>
                  )}
                </div>

                {!isCustomer && (
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                      isBot
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {isBot ? <Bot className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={scrollEndRef} />
      </div>
    </div>
  );
}
