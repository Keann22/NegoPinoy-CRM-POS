import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, Hash, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MentionInput } from '@/components/dashboard/mention-input';
import { cn } from '@/lib/utils';
import { avatarColor, initials, threadTitle } from '@/lib/utils/messages';
import type { Thread } from '@/types';

interface ActiveThreadViewProps {
  selectedThread: Thread | null;
  myName: string;
  isSending: boolean;
  composerText: string;
  setComposerText: (text: string) => void;
  composerMentions: string[];
  setComposerMentions: (mentions: string[]) => void;
  isUrgent: boolean;
  setIsUrgent: (urgent: boolean | ((u: boolean) => boolean)) => void;
  onSend: () => void;
}

export function ActiveThreadView({
  selectedThread,
  myName,
  isSending,
  composerText,
  setComposerText,
  composerMentions,
  setComposerMentions,
  isUrgent,
  setIsUrgent,
  onSend,
}: ActiveThreadViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [selectedThread?.id, selectedThread?.messages.length]);

  if (!selectedThread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <MessageCircle className="h-10 w-10" />
        <p className="text-sm">Select a thread to start reading.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-4 py-3 border-b flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {selectedThread.issueType !== 'direct' && <Hash className="h-4 w-4 text-muted-foreground shrink-0" />}
            <h2 className="text-sm font-semibold truncate">{threadTitle(selectedThread)}</h2>
            {selectedThread.issueType !== 'direct' && (
              <Badge variant={selectedThread.status === 'open' ? 'default' : 'secondary'} className="text-[10px]">
                {selectedThread.status === 'open' ? 'Open' : 'Resolved'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {selectedThread.issueType === 'direct'
              ? 'Private conversation'
              : selectedThread.productName
              ? `About: ${selectedThread.productName}`
              : `Started by ${selectedThread.reportedByName || 'system'}`}
          </p>
        </div>

        {selectedThread.members.length > 0 && (
          <div className="hidden sm:flex -space-x-1.5">
            {selectedThread.members.slice(0, 5).map((m) => (
              <span
                key={m.userId}
                title={m.displayName}
                className={cn(
                  'h-7 w-7 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-semibold',
                  avatarColor(m.displayName)
                )}
              >
                {initials(m.displayName)}
              </span>
            ))}
            {selectedThread.members.length > 5 && (
              <span className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[9px] font-semibold">
                +{selectedThread.members.length - 5}
              </span>
            )}
          </div>
        )}

        {selectedThread.orderId && (
          <Button asChild variant="outline" size="sm" className="gap-1 shrink-0">
            <Link href={`/dashboard/orders/${selectedThread.orderId}`}>
              View order <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {selectedThread.messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground mt-8">
            No messages yet. Say something to get it started.
          </div>
        ) : (
          selectedThread.messages.map((msg) => {
            const isMine = (msg.sender_name || '').trim().toLowerCase() === myName.toLowerCase();
            return (
              <div key={msg.id} className={cn('flex flex-col max-w-[80%]', isMine ? 'items-end ml-auto' : 'items-start')}>
                <span className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                  {msg.requires_attention && <AlertTriangle className="h-3 w-3 text-red-500" />}
                  {isMine ? 'You' : msg.sender_name}
                  <span>· {new Date(msg.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </span>
                <div
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm whitespace-pre-wrap shadow-sm',
                    msg.requires_attention
                      ? 'bg-red-50 border border-red-200 text-red-900'
                      : isMine
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-muted rounded-tl-none'
                  )}
                >
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t flex items-center gap-2">
        {selectedThread.issueType === 'direct' ? (
          <Input
            placeholder={`Message ${threadTitle(selectedThread)}...`}
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            disabled={isSending}
          />
        ) : (
          <>
            <MentionInput
              value={composerText}
              onChange={setComposerText}
              mentions={composerMentions}
              onMentionsChange={setComposerMentions}
              onSubmit={onSend}
              placeholder="Reply... use @ to tag someone"
              disabled={isSending}
            />
            <Button
              variant={isUrgent ? 'destructive' : 'outline'}
              size="icon"
              title={isUrgent ? 'Marked urgent' : 'Mark as urgent'}
              onClick={() => setIsUrgent((u) => !u)}
            >
              <AlertTriangle className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button onClick={onSend} disabled={isSending || !composerText.trim()} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
