'use client';

import React from 'react';
import { Search, Bot, User, MessageCircle, Star, Sparkles } from 'lucide-react';
import type { ChatThread } from '@/types';
import type { ChatFilterTab } from '@/hooks/useChat';

interface ChatSidebarProps {
  threads: ChatThread[];
  selectedPsid: string | null;
  onSelect: (psid: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterTab: ChatFilterTab;
  onFilterChange: (tab: ChatFilterTab) => void;
  loading: boolean;
  isRealtimeActive: boolean;
}

export function getPsidColor(psid: string) {
  const n = psid?.split('').reduce((a, c) => a + c.charCodeAt(0), 0) ?? 0;
  return `hsl(${Math.abs(n) % 360}, 65%, 42%)`;
}

export function ChatAvatar({ name, psid, size = 36 }: { name?: string | null; psid: string; size?: number }) {
  const initial = name && !name.startsWith('Customer') ? name.charAt(0).toUpperCase() : '?';
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: getPsidColor(psid),
        fontSize: size * 0.4,
      }}
      className="flex items-center justify-center font-bold text-white shrink-0 shadow-sm ring-1 ring-border/50"
    >
      {initial}
    </div>
  );
}

export function ChatSidebar({
  threads,
  selectedPsid,
  onSelect,
  searchQuery,
  onSearchChange,
  filterTab,
  onFilterChange,
  loading,
  isRealtimeActive,
}: ChatSidebarProps) {
  return (
    <div className="w-80 md:w-88 border-r border-border flex flex-col bg-card/60 shrink-0 h-full">
      {/* Header & Status */}
      <div className="p-3.5 border-b border-border space-y-3 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Inbox ({threads.length})
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-background border border-border text-[10px] font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                isRealtimeActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="text-muted-foreground">{isRealtimeActive ? 'LIVE' : 'SYNCING'}</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, PSID, message..."
            className="w-full text-xs bg-background border border-input rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-muted-foreground/60 transition-all"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex p-0.5 bg-muted/60 rounded-xl text-[11px] font-medium text-muted-foreground">
          <button
            onClick={() => onFilterChange('all')}
            className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
              filterTab === 'all'
                ? 'bg-background text-foreground font-semibold shadow-xs'
                : 'hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => onFilterChange('unread')}
            className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
              filterTab === 'unread'
                ? 'bg-background text-amber-600 dark:text-amber-400 font-semibold shadow-xs'
                : 'hover:text-foreground'
            }`}
          >
            <span>Unread</span>
            {threads.some((t) => t.unread) && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
          </button>
          <button
            onClick={() => onFilterChange('vip')}
            className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
              filterTab === 'vip'
                ? 'bg-background text-purple-600 dark:text-purple-400 font-semibold shadow-xs'
                : 'hover:text-foreground'
            }`}
          >
            <Sparkles className="w-2.5 h-2.5" />
            <span>VIP</span>
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40">
        {loading && threads.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Loading conversations...</p>
          </div>
        ) : threads.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No matching conversations found.
          </div>
        ) : (
          threads.map((thread) => {
            const isSelected = selectedPsid === thread.psid;
            const isCustomer = thread.lastSender === 'customer';
            const isBot = thread.lastSender === 'bot';

            return (
              <button
                key={thread.psid}
                onClick={() => onSelect(thread.psid)}
                className={`w-full text-left p-3 transition-all flex items-start gap-3 relative ${
                  isSelected
                    ? 'bg-blue-500/10 dark:bg-blue-500/15 border-l-4 border-blue-500 pl-2'
                    : 'hover:bg-muted/40 border-l-4 border-transparent'
                }`}
              >
                <ChatAvatar name={thread.fullName} psid={thread.psid} size={36} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span
                      className={`text-xs truncate ${
                        thread.unread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90'
                      }`}
                    >
                      {thread.fullName}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {thread.lastDate.toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {thread.sukiTier && (
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                          thread.sukiTier === 'VIP'
                            ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/20'
                            : thread.sukiTier === 'Regular'
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/20'
                            : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {thread.sukiTier}
                      </span>
                    )}

                    {thread.unread && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-500 text-white rounded-full">
                        NEW
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                    {isBot ? (
                      <Bot className="w-3 h-3 text-emerald-500 shrink-0" />
                    ) : isCustomer ? (
                      <User className="w-3 h-3 text-slate-400 shrink-0" />
                    ) : (
                      <span className="text-[10px] text-blue-500 font-semibold shrink-0">You:</span>
                    )}
                    <span className="truncate">{thread.lastMessage || '(Empty message)'}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
