'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Sparkles,
  Check,
  X,
  ExternalLink,
  Search,
  Link2,
  Phone,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCustomerLiveChatMatch } from '@/hooks/useCustomerLiveChatMatch';
import { LiveChatSearchDialog } from './LiveChatSearchDialog';
import { MatchReason, MergeWarning } from './LiveChatMergeWarning';

interface LiveChatMatchCardProps {
  customerId?: string | null;
  fullName?: string | null;
  mobileNumber?: string | null;
  addressSummary?: string | null;
  psid?: string | null;
  mode?: 'full' | 'compact';
  onLinked?: (psid: string) => void;
}

export function LiveChatMatchCard({
  customerId,
  fullName,
  mobileNumber,
  addressSummary,
  psid,
  mode = 'full',
  onLinked,
}: LiveChatMatchCardProps) {
  const {
    linkedPsid,
    recentMessages,
    chatMatches,
    connectingPsid,
    connectChatPsid,
    dismissMatch,
    disconnectChat,
    searchResults,
    isSearchingChats,
    searchLiveChats,
  } = useCustomerLiveChatMatch({
    customerId,
    fullName,
    mobileNumber,
    psid,
    onLinked,
  });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  if (!customerId) return null;
  const topMatch = chatMatches[0] || null;

  const handleOpenSearch = () => {
    const initial = fullName || '';
    setSearchTerm(initial);
    setSearchOpen(true);
    if (initial.trim().length >= 2) searchLiveChats(initial);
  };

  if (mode === 'compact') {
    if (linkedPsid) {
      return (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-semibold">
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Connected to Live Chat</span>
          </div>
          <Link
            href={`/dashboard/chat?psid=${encodeURIComponent(linkedPsid)}`}
            target="_blank"
            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>Open Chat</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      );
    }

    if (!topMatch) return null;

    return (
      <div className="p-3 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 space-y-2 text-xs shadow-xs animate-in fade-in">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Same customer from Live Chat?</span>
          </div>
          <button
            type="button"
            onClick={() => dismissMatch(topMatch.psid)}
            className="text-muted-foreground hover:text-foreground p-0.5"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-background/90 border border-border rounded-lg p-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-foreground">{topMatch.chat_customer_name}</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              Messenger #{topMatch.psid.slice(-4)}
            </span>
          </div>
          {topMatch.last_message && (
            <p className="text-[11px] text-muted-foreground italic line-clamp-2">
              &ldquo;{topMatch.last_message}&rdquo;
            </p>
          )}
          <MatchReason match={topMatch} />
          <MergeWarning match={topMatch} />
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={connectingPsid === topMatch.psid}
            onClick={() => connectChatPsid(topMatch.psid)}
            className="h-7 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            {connectingPsid === topMatch.psid ? 'Connecting...' : 'Yes, Same — Connect'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => dismissMatch(topMatch.psid)}
            className="h-7 text-xs"
          >
            Not Same
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {linkedPsid ? (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-600 text-white">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-foreground">
                    Messenger Live Chat Connected
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
                    Messenger #{linkedPsid.slice(-4)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Customer replies and chat history are synced to this account.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={connectingPsid === linkedPsid}
                onClick={() => disconnectChat()}
                className="text-muted-foreground"
                title="Wrong person? Disconnect this chat"
              >
                <X className="w-4 h-4 mr-1" />
                Disconnect chat
              </Button>
              <Button size="sm" asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                <Link href={`/dashboard/chat?psid=${encodeURIComponent(linkedPsid)}`}>
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  Message on Live Chat
                </Link>
              </Button>
            </div>
          </div>

          {recentMessages.length > 0 && (
            <div className="bg-background border border-border/80 rounded-xl p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Recent Messenger Conversation
              </div>
              <div className="space-y-1.5">
                {recentMessages.map((msg) => {
                  const isCustomer = msg.sender_type === 'customer';
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 text-xs ${
                        isCustomer ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          isCustomer
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {isCustomer ? 'Customer' : 'Staff'}
                      </span>
                      <span className="flex-1 line-clamp-1">{msg.message_text}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(msg.created_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : topMatch ? (
        <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 space-y-3 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                We found a matching customer in Live Chat — are these two the same person?
              </span>
            </div>
            <button
              type="button"
              onClick={() => dismissMatch(topMatch.psid)}
              className="text-muted-foreground hover:text-foreground p-1 rounded"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-background border border-border rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  From Messenger Live Chat
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  PSID: {topMatch.psid}
                </span>
              </div>
              <div className="font-bold text-sm text-foreground">
                {topMatch.chat_customer_name}
              </div>
              {topMatch.mobile_number && (
                <div className="text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {topMatch.mobile_number}
                </div>
              )}
              {topMatch.last_message && (
                <div className="mt-1 p-2 rounded-lg bg-muted/60 text-muted-foreground italic text-[11px]">
                  &ldquo;{topMatch.last_message}&rdquo;
                </div>
              )}
              <MatchReason match={topMatch} />
              <MergeWarning match={topMatch} />
            </div>

            <div className="bg-background border border-border rounded-xl p-3 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Customer Account on File
              </span>
              <div className="font-bold text-sm text-foreground">{fullName}</div>
              {mobileNumber && (
                <div className="text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {mobileNumber}
                </div>
              )}
              {addressSummary && (
                <div className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{addressSummary}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              disabled={connectingPsid === topMatch.psid}
              onClick={() => connectChatPsid(topMatch.psid)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="w-4 h-4 mr-1.5" />
              {connectingPsid === topMatch.psid
                ? 'Connecting...'
                : 'Yes, Same Person — Connect Live Chat'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => dismissMatch(topMatch.psid)}>
              No, Not the Same
            </Button>
            <Button size="sm" variant="ghost" onClick={handleOpenSearch}>
              <Search className="w-3.5 h-3.5 mr-1.5" />
              Search Different Chat
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MessageSquare className="w-4 h-4 opacity-60" />
            <span>
              This customer account is not yet linked to a Facebook Messenger conversation.
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={handleOpenSearch} className="h-8 text-xs">
            <Link2 className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
            Connect Messenger Chat
          </Button>
        </div>
      )}

      <LiveChatSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        customerName={fullName}
        searchTerm={searchTerm}
        onSearchTermChange={(term) => {
          setSearchTerm(term);
          searchLiveChats(term);
        }}
        results={searchResults}
        isSearching={isSearchingChats}
        connectingPsid={connectingPsid}
        onConnect={connectChatPsid}
      />
    </>
  );
}
