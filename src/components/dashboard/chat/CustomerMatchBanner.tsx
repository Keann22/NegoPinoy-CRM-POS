'use client';

import React, { useState } from 'react';
import {
  Link2,
  Check,
  X,
  Search,
  MapPin,
  Phone,
  ShoppingBag,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCustomerSearch } from '@/hooks/useCustomerSearch';
import type { MatchedCustomerCandidate } from '@/types';

interface CustomerMatchBannerProps {
  chatName: string;
  candidates: MatchedCustomerCandidate[];
  linking: boolean;
  onConfirmLink: (customerId: string) => Promise<boolean>;
  onDismissCandidate: (customerId: string) => void;
}

export function CustomerMatchBanner({
  chatName,
  candidates,
  linking,
  onConfirmLink,
  onDismissCandidate,
}: CustomerMatchBannerProps) {
  if (!candidates || candidates.length === 0) return null;

  const top = candidates[0];

  return (
    <div className="p-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-2.5 shadow-2xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-bold text-xs">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>Same customer on file?</span>
        </div>
        <button
          type="button"
          onClick={() => onDismissCandidate(top.id)}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          title="Not the same customer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        We found an existing customer account matching{' '}
        <span className="font-semibold text-foreground">{chatName}</span>:
      </p>

      <div className="bg-background/90 border border-border/80 rounded-xl p-2.5 space-y-1 text-xs">
        <div className="font-bold text-foreground flex items-center justify-between gap-1">
          <span className="truncate">{top.full_name}</span>
          {top.order_count > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
              {top.order_count} order{top.order_count === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {top.mobile_number && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Phone className="w-3 h-3 shrink-0" />
            <span>{top.mobile_number}</span>
          </div>
        )}
        {(top.city || top.province || top.address_line) && (
          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="line-clamp-2">
              {[top.barangay, top.city, top.province].filter(Boolean).join(', ') ||
                top.address_line}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 pt-0.5">
        <button
          type="button"
          disabled={linking}
          onClick={() => onConfirmLink(top.id)}
          className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{linking ? 'Linking...' : 'Yes, Connect Account'}</span>
        </button>
        <button
          type="button"
          disabled={linking}
          onClick={() => onDismissCandidate(top.id)}
          className="py-1.5 px-2.5 bg-background hover:bg-muted border border-border text-muted-foreground rounded-xl text-[11px] font-semibold transition-all"
        >
          Not Same
        </button>
      </div>
    </div>
  );
}

interface LinkCustomerAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatName: string;
  psid: string;
  linking: boolean;
  onSelectCustomer: (customerId: string) => Promise<boolean>;
}

export function LinkCustomerAccountDialog({
  open,
  onOpenChange,
  chatName,
  psid,
  linking,
  onSelectCustomer,
}: LinkCustomerAccountDialogProps) {
  const [query, setQuery] = useState(
    chatName && !chatName.startsWith('Customer-') ? chatName : ''
  );
  const { results, isSearching } = useCustomerSearch(query);

  const handleConnect = async (customerId: string) => {
    const ok = await onSelectCustomer(customerId);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-600" />
            Connect Chat to Customer Account
          </DialogTitle>
          <DialogDescription>
            Link Messenger user <strong>{chatName}</strong> ({psid}) to an existing customer
            account on file so their orders, address, and store credit sync together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer name on file..."
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {isSearching && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Searching customer accounts...
              </p>
            )}
            {!isSearching && results.length === 0 && query.trim().length > 0 && (
              <p className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-xl">
                No matching customer accounts found for &ldquo;{query}&rdquo;.
              </p>
            )}
            {!isSearching &&
              results.map((cust) => {
                const raw = cust as unknown as Record<string, unknown>;
                const fullName =
                  (raw.full_name as string) ||
                  `${cust.firstName || ''} ${cust.lastName || ''}`.trim();
                const phone = (raw.mobile_number as string) || '';
                const city = (raw.city as string) || (raw.location_city as string) || '';
                const province = (raw.province as string) || '';
                const addressLine = (raw.address_line as string) || '';
                const otherChat = Boolean(raw.psid) && raw.psid !== psid;

                return (
                  <div
                    key={cust.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-all"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-semibold text-xs text-foreground truncate">
                        {fullName}
                      </div>
                      {phone && (
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span>{phone}</span>
                        </div>
                      )}
                      {(city || province || addressLine) && (
                        <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {[city, province].filter(Boolean).join(', ') || addressLine}
                          </span>
                        </div>
                      )}
                      {otherChat && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400">
                          Already connected to another Messenger chat
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      disabled={linking || otherChat}
                      onClick={() => handleConnect(cust.id)}
                      className="shrink-0 h-8 text-xs"
                    >
                      <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                      Connect
                    </Button>
                  </div>
                );
              })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
