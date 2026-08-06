import { useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Hash, MessageCircle, MessageSquarePlus, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { avatarColor, initials, threadTitle } from '@/lib/utils/messages';
import type { Thread } from '@/types';
import type { StaffUser } from '@/hooks/useStaffDirectory';

interface MessagesSidebarProps {
  isLoading: boolean;
  orderThreads: Thread[];
  directThreads: Thread[];
  resolvedThreads: Thread[];
  selectedId: string | null;
  myId?: string;
  staff: StaffUser[];
  onSelectThread: (t: Thread) => void;
  onStartDirectMessage: (other: { id: string; fullName: string }) => void;
  onOpenNewTopic: () => void;
}

export function MessagesSidebar({
  isLoading,
  orderThreads,
  directThreads,
  resolvedThreads,
  selectedId,
  myId,
  staff,
  onSelectThread,
  onStartDirectMessage,
  onOpenNewTopic,
}: MessagesSidebarProps) {
  const [showResolved, setShowResolved] = useState(false);
  const [isDmPickerOpen, setIsDmPickerOpen] = useState(false);

  const renderThreadRow = (t: Thread) => {
    const last = t.messages[t.messages.length - 1] || null;
    const isSelected = t.id === selectedId;
    const isDirect = t.issueType === 'direct';
    const title = threadTitle(t, myId);

    return (
      <button
        key={t.id}
        onClick={() => onSelectThread(t)}
        className={cn(
          'w-full text-left px-3 py-2 rounded-md transition-colors flex items-start gap-2',
          isSelected ? 'bg-primary/10' : 'hover:bg-muted'
        )}
      >
        {isDirect ? (
          <span
            className={cn(
              'mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold',
              avatarColor(title)
            )}
          >
            {initials(title) || <User className="h-3.5 w-3.5" />}
          </span>
        ) : (
          <Hash className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={cn('text-sm truncate', t.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
              {title}
            </span>
            {t.unreadCount > 0 && (
              <Badge className="h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] bg-red-500 hover:bg-red-600 shrink-0">
                {t.unreadCount > 9 ? '9+' : t.unreadCount}
              </Badge>
            )}
          </span>
          <span className="block text-xs text-muted-foreground truncate">
            {last ? (
              <>
                <span className="font-medium">
                  {last.sender_name}
                  :
                </span>{' '}
                {last.message}
              </>
            ) : (
              <span className="italic">No messages yet</span>
            )}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="w-72 sm:w-80 shrink-0 border-r flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <MessageCircle className="h-4 w-4" /> Messages
        </h1>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="New message about an order or product" onClick={onOpenNewTopic}>
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        <div>
          <div className="px-3 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Direct messages
            </span>
            <Popover open={isDmPickerOpen} onOpenChange={setIsDmPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" title="New direct message">
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Message who?" />
                  <CommandList>
                    <CommandEmpty>No staff found.</CommandEmpty>
                    <CommandGroup>
                      {staff.map((s) => (
                        <CommandItem 
                          key={s.id} 
                          value={s.fullName} 
                          onSelect={() => {
                            onStartDirectMessage(s);
                            setIsDmPickerOpen(false);
                          }}
                        >
                          <span
                            className={cn(
                              'mr-2 h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-semibold',
                              avatarColor(s.fullName)
                            )}
                          >
                            {initials(s.fullName)}
                          </span>
                          <span className="flex flex-col">
                            <span>{s.fullName}</span>
                            {s.roles.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">{s.roles.join(', ')}</span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {directThreads.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground italic">
              No conversations yet. Use + to message someone.
            </div>
          ) : (
            directThreads.map(renderThreadRow)
          )}
        </div>

        <div>
          <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Order threads
          </div>
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
          ) : orderThreads.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground italic">No open threads.</div>
          ) : (
            orderThreads.map(renderThreadRow)
          )}
        </div>

        {resolvedThreads.length > 0 && (
          <Collapsible open={showResolved} onOpenChange={setShowResolved}>
            <CollapsibleTrigger className="w-full px-3 pb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
              {showResolved ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Archive className="h-3 w-3" /> Resolved ({resolvedThreads.length})
            </CollapsibleTrigger>
            <CollapsibleContent>{resolvedThreads.map(renderThreadRow)}</CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
