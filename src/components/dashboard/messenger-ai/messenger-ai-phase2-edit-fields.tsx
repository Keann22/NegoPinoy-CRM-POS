'use client';

import React from 'react';
import { KNOWN_BUS_COMPANIES } from '@/types/bus-shipping.types';
import { CR_RETURN_REASONS } from '@/types/customer-returns.types';
import { Input } from '@/components/ui/input';
import type {
  CopilotActionPayload,
  CopilotOpenOrderOption,
  DamageComplaintReason,
  DamageComplaintSource,
} from '@/types';

export function MessengerAiPhase2EditFields({
  draft,
  orders,
  setDraft,
}: {
  draft: CopilotActionPayload;
  orders: CopilotOpenOrderOption[];
  setDraft: (next: CopilotActionPayload) => void;
}) {
  if (draft.kind === 'bus_shipping_request') {
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-semibold block mb-1">Bus Company</label>
            <Input
              list="copilot-bus-companies"
              value={draft.busCompany}
              onChange={(e) => setDraft({ ...draft, busCompany: e.target.value })}
              className="h-8 text-xs"
            />
            <datalist id="copilot-bus-companies">
              {KNOWN_BUS_COMPANIES.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="font-semibold block mb-1">Terminal / Station</label>
            <Input
              value={draft.destination}
              onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
              placeholder="e.g. Cubao / Tuguegarao"
              className="h-8 text-xs"
            />
          </div>
        </div>
        {orders.length > 0 && (
          <div className="space-y-1">
            <label className="font-semibold block">Orders to Mark</label>
            {orders.map((o) => {
              const checked = draft.orderIds.includes(o.id);
              return (
                <label key={o.id} className="flex items-center gap-2 border border-border rounded-lg p-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const nextIds = e.target.checked
                        ? Array.from(new Set([...draft.orderIds, o.id]))
                        : draft.orderIds.filter((id) => id !== o.id);
                      setDraft({ ...draft, orderIds: nextIds, orderId: nextIds[0] || null });
                    }}
                  />
                  <span>
                    <strong>{o.shortId}</strong> • {o.paymentMethod} • {o.status}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div>
          <label className="font-semibold block mb-1">Note (optional)</label>
          <Input
            value={draft.note || ''}
            onChange={(e) => setDraft({ ...draft, note: e.target.value || null })}
            className="h-8 text-xs"
          />
        </div>
      </div>
    );
  }

  if (draft.kind === 'damage_or_complaint') {
    const reasons = CR_RETURN_REASONS[draft.source] || CR_RETURN_REASONS.damage_report;
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-semibold block mb-1">Case Type</label>
            <select
              value={draft.source}
              onChange={(e) => setDraft({ ...draft, source: e.target.value as DamageComplaintSource })}
              className="w-full border border-input rounded-lg px-2 py-1.5 bg-background"
            >
              <option value="damage_report">Customer reported damage</option>
              <option value="shipped_back">Customer shipping it back</option>
            </select>
          </div>
          <div>
            <label className="font-semibold block mb-1">Reason</label>
            <select
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value as DamageComplaintReason })}
              className="w-full border border-input rounded-lg px-2 py-1.5 bg-background"
            >
              {reasons.filter((r) => r !== 'Changed mind').map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="font-semibold block mb-1">Details / Notes</label>
          <Input
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.attachPhoto}
            onChange={(e) => setDraft({ ...draft, attachPhoto: e.target.checked })}
          />
          <span>Attach customer&apos;s Messenger photo to return case</span>
        </label>
      </div>
    );
  }

  if (draft.kind === 'waiting_prompt_reply') {
    const choiceOptions =
      draft.promptType === 'rts'
        ? ['resend', 'cancel', 'waiting']
        : draft.promptType === 'ship_hold'
          ? ['release', 'not_yet', 'waiting']
          : ['wait', 'waiting_customer', 'editing'];
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-semibold block mb-1">Customer Choice</label>
            <select
              value={draft.choice}
              onChange={(e) => setDraft({ ...draft, choice: e.target.value })}
              className="w-full border border-input rounded-lg px-2 py-1.5 bg-background"
            >
              {choiceOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {draft.promptType === 'ship_hold' && draft.choice === 'not_yet' && (
            <div>
              <label className="font-semibold block mb-1">New Check Date</label>
              <Input
                type="date"
                value={draft.checkOn || ''}
                onChange={(e) => setDraft({ ...draft, checkOn: e.target.value || null })}
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>
        <div>
          <label className="font-semibold block mb-1">Note (optional)</label>
          <Input
            value={draft.note || ''}
            onChange={(e) => setDraft({ ...draft, note: e.target.value || null })}
            className="h-8 text-xs"
          />
        </div>
      </div>
    );
  }

  if (draft.kind === 'delivery_or_order_note') {
    return (
      <div className="space-y-2.5">
        <div>
          <label className="font-semibold block mb-1">Delivery / Order Note</label>
          <Input
            value={draft.deliveryNote}
            onChange={(e) => setDraft({ ...draft, deliveryNote: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-semibold block mb-1">Receiver Name (order only)</label>
            <Input
              value={draft.receiverName || ''}
              onChange={(e) => setDraft({ ...draft, receiverName: e.target.value || null })}
              placeholder="Leave blank to keep existing"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Receiver Phone (order only)</label>
            <Input
              value={draft.receiverPhone || ''}
              onChange={(e) => setDraft({ ...draft, receiverPhone: e.target.value || null })}
              placeholder="Never changes main customer #"
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
