'use client';

import React from 'react';
import type { MatchedChatCandidate } from '@/types';

/** Shown when the Messenger contact already has its own orders / credit: connecting merges two accounts. */
export function MergeWarning({ match }: { match: MatchedChatCandidate }) {
  const orders = Number(match.chat_order_count || 0);
  const credit = Number(match.chat_store_credit || 0);
  if (orders <= 0 && Math.abs(credit) < 0.01) return null;
  const parts = [
    orders > 0 ? `${orders} order${orders === 1 ? '' : 's'}` : null,
    Math.abs(credit) >= 0.01 ? `₱${credit.toLocaleString('en-PH')} store credit` : null,
  ].filter(Boolean);
  return (
    <div className="text-[11px] font-semibold text-red-600 dark:text-red-400">
      Has its own account ({parts.join(', ')}). Connecting merges both accounts.
    </div>
  );
}

/** Which details agree, so staff can judge the match. */
export function MatchReason({ match }: { match: MatchedChatCandidate }) {
  const bits = [
    match.phone_match ? 'same phone' : null,
    match.name_match === 'exact' ? 'same name' : match.name_match === 'similar' ? 'similar name' : null,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return <span className="text-[10px] text-muted-foreground">Matched on {bits.join(' + ')}</span>;
}
