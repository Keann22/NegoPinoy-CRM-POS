'use client';

import React from 'react';
import { Truck, AlertOctagon, MessageSquareReply, StickyNote } from 'lucide-react';
import type { CopilotActionPayload } from '@/types';

export function MessengerAiPhase2Preview({
  payload,
  hasAttachment,
}: {
  payload: CopilotActionPayload;
  hasAttachment: boolean;
}) {
  if (payload.kind === 'bus_shipping_request') {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 font-medium">
          <Truck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          <span>
            Bus: <strong>{payload.busCompany}</strong> — <strong>{payload.destination || 'Station TBD'}</strong>
          </span>
        </div>
        <div className="text-muted-foreground">
          {payload.orderIds.length} order(s):{' '}
          {payload.orderIds.map((id) => `#${id.slice(0, 7).toUpperCase()}`).join(', ') || 'Pick target order'}
          {payload.note ? ` • "${payload.note}"` : ''}
        </div>
      </div>
    );
  }

  if (payload.kind === 'damage_or_complaint') {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-300">
          <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
          <span>
            Open {payload.source === 'shipped_back' ? 'Shipped-Back' : 'Damage'} Case • <strong>{payload.reason}</strong>
          </span>
        </div>
        {payload.items.length > 0 && (
          <div className="text-foreground">
            Items: {payload.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
          </div>
        )}
        <div className="text-muted-foreground">
          {payload.notes}
          {payload.attachPhoto && hasAttachment ? ' • Will attach chat photo' : ''}
        </div>
      </div>
    );
  }

  if (payload.kind === 'waiting_prompt_reply') {
    const typeLabel =
      payload.promptType === 'rts'
        ? 'RTS Return'
        : payload.promptType === 'ship_hold'
          ? 'Ship Hold'
          : 'Supplier Stock';
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 font-medium text-teal-700 dark:text-teal-300">
          <MessageSquareReply className="w-3.5 h-3.5 shrink-0" />
          <span>
            Answer <strong>{typeLabel}</strong> prompt: <strong>{payload.choice}</strong>
          </span>
        </div>
        <div className="text-muted-foreground">
          {payload.checkOn ? `Check date: ${payload.checkOn}` : null}
          {payload.shippingPayer ? ` • Reship SF: ${payload.shippingPayer === 'us' ? 'Free (us)' : 'Customer'}` : null}
          {payload.note ? ` — "${payload.note}"` : null}
        </div>
      </div>
    );
  }

  if (payload.kind === 'delivery_or_order_note') {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 font-medium">
          <StickyNote className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <span>Delivery / Order Note</span>
        </div>
        <div>&ldquo;{payload.deliveryNote}&rdquo;</div>
        {(payload.receiverName || payload.receiverPhone) && (
          <div className="text-muted-foreground">
            Order receiver override: {[payload.receiverName, payload.receiverPhone].filter(Boolean).join(' • ')} (customer mobile stays untouched)
          </div>
        )}
      </div>
    );
  }

  return null;
}
