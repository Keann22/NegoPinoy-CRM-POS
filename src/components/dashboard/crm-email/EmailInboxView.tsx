'use client';

import { useState } from 'react';
import { Mail, Send, Inbox, RefreshCw, User, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { CrmEmailThread } from '@/types/crm-email.types';

interface EmailInboxViewProps {
  threads: CrmEmailThread[];
  activeThread: CrmEmailThread | null;
  onSelectThread: (email: string) => void;
  replyText: string;
  setReplyText: (text: string) => void;
  isSending: boolean;
  isSyncing: boolean;
  onSendReply: () => Promise<boolean>;
  onSync: () => Promise<void>;
}

export function EmailInboxView({
  threads,
  activeThread,
  onSelectThread,
  replyText,
  setReplyText,
  isSending,
  isSyncing,
  onSendReply,
  onSync,
}: EmailInboxViewProps) {
  const [search, setSearch] = useState('');

  const filteredThreads = threads.filter(
    (t) =>
      t.customerName.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase()) ||
      t.lastSubject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Pane: Customer Threads List */}
      <Card className="lg:col-span-5 border shadow-sm h-[600px] flex flex-col">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Inbox className="w-4 h-4 text-primary" />
              Customer Conversations
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={isSyncing}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Replies
            </Button>
          </div>
          <CardDescription className="text-xs pt-1">
            Incoming email replies from Namecheap (`missd@negopinoy.ph`).
          </CardDescription>
          <div className="pt-2">
            <Input
              placeholder="Search customer or subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto">
          {filteredThreads.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Mail className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No email conversations found. Click "Sync Replies" above to check Namecheap IMAP.
            </div>
          ) : (
            <div className="divide-y">
              {filteredThreads.map((thread) => {
                const isSelected = activeThread?.email.toLowerCase() === thread.email.toLowerCase();
                return (
                  <button
                    key={thread.email}
                    type="button"
                    onClick={() => onSelectThread(thread.email)}
                    className={`w-full p-3 text-left transition-colors flex flex-col gap-1 ${
                      isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground truncate">{thread.customerName}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {format(new Date(thread.lastMessageAt), 'MMM dd h:mm a')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-muted-foreground truncate">{thread.email}</span>
                      <Badge variant="outline" className="text-[9px] uppercase px-1 py-0">
                        {thread.sukiTier || 'NEWBIE'}
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-foreground/80 truncate mt-0.5">{thread.lastSubject}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right Pane: Conversation Timeline & Sales Reply Composer */}
      <Card className="lg:col-span-7 border shadow-sm h-[600px] flex flex-col">
        {activeThread ? (
          <>
            <CardHeader className="pb-3 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    {activeThread.customerName}
                  </CardTitle>
                  <CardDescription className="text-xs font-mono">
                    {activeThread.email} • Tier: {activeThread.sukiTier || 'NEWBIE'}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs font-mono">
                  {activeThread.messages.length} Message{activeThread.messages.length === 1 ? '' : 's'}
                </Badge>
              </div>
            </CardHeader>

            {/* Messages Timeline */}
            <CardContent className="p-4 flex-1 overflow-y-auto space-y-4 bg-muted/10">
              {activeThread.messages.map((msg) => {
                const isInbound = msg.direction === 'inbound';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[85%] ${
                      isInbound ? 'mr-auto items-start' : 'ml-auto items-end'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                      <span className="font-semibold text-foreground">
                        {isInbound ? msg.recipient_name || activeThread.customerName : 'Miss D (Sales)'}
                      </span>
                      <span>•</span>
                      <span className="font-mono">{format(new Date(msg.created_at), 'MMM dd, h:mm a')}</span>
                    </div>

                    <div
                      className={`p-3 rounded-lg text-xs leading-relaxed whitespace-pre-line shadow-2xs ${
                        isInbound
                          ? 'bg-card border text-card-foreground rounded-tl-none'
                          : 'bg-slate-900 text-slate-100 rounded-tr-none'
                      }`}
                    >
                      <div className="font-semibold text-[11px] mb-1 opacity-80 border-b pb-1">
                        {msg.subject}
                      </div>
                      {msg.body}
                    </div>
                  </div>
                );
              })}
            </CardContent>

            {/* Sales Reply Composer Footer */}
            <div className="p-3 border-t bg-card space-y-2">
              <Textarea
                placeholder={`Type sales reply to ${activeThread.customerName}...`}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="text-xs min-h-[70px] resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Sending live as <strong className="text-foreground">Miss D &lt;missd@negopinoy.ph&gt;</strong>
                </span>
                <Button
                  size="sm"
                  onClick={onSendReply}
                  disabled={isSending || !replyText.trim()}
                  className="gap-1.5 text-xs font-medium"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Reply
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-xs text-muted-foreground my-auto">
            Select a customer conversation on the left to view messages and reply.
          </div>
        )}
      </Card>
    </div>
  );
}
