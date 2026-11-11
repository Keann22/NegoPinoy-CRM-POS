'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MatchedChatCandidate } from '@/types';
import { MergeWarning } from './LiveChatMergeWarning';

interface LiveChatSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName?: string | null;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  results: MatchedChatCandidate[];
  isSearching: boolean;
  connectingPsid: string | null;
  onConnect: (psid: string) => Promise<boolean>;
}

export function LiveChatSearchDialog({
  open,
  onOpenChange,
  customerName,
  searchTerm,
  onSearchTermChange,
  results,
  isSearching,
  connectingPsid,
  onConnect,
}: LiveChatSearchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Live Chat to {customerName}</DialogTitle>
          <DialogDescription>
            Search by the customer&apos;s Facebook Messenger name to link their chat history
            to this account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            placeholder="Type Facebook name..."
            autoFocus
          />
          <div className="max-h-64 overflow-y-auto space-y-2">
            {isSearching && (
              <p className="text-xs text-muted-foreground text-center py-4">Searching...</p>
            )}
            {!isSearching && results.length === 0 && searchTerm.trim().length >= 2 && (
              <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                No Messenger chats found matching &ldquo;{searchTerm}&rdquo;.
              </p>
            )}
            {results.map((item) => (
              <div
                key={item.psid}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-card text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="font-semibold text-foreground truncate">{item.chat_customer_name}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    Messenger #{item.psid.slice(-4)}
                  </div>
                  <MergeWarning match={item} />
                </div>
                <Button
                  size="sm"
                  disabled={connectingPsid === item.psid}
                  onClick={async () => {
                    const ok = await onConnect(item.psid);
                    if (ok) onOpenChange(false);
                  }}
                  className="h-7 text-xs shrink-0"
                >
                  Connect
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
