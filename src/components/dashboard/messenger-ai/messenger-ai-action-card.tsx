'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Check, Pencil, X, Copy, ExternalLink, AlertTriangle, Sparkles, Image as ImageIcon,
} from 'lucide-react';
import {
  ACTION_TYPE_META,
  type CopilotActionPayload,
  type MessengerAiAction,
} from '@/types';

interface MessengerAiActionCardProps {
  action: MessengerAiAction;
  busy: boolean;
  onConfirm: (payload: CopilotActionPayload) => void;
  onEdit: (currentPayload: CopilotActionPayload) => void;
  onReject: () => void;
}

export function MessengerAiActionCard({
  action,
  busy,
  onConfirm,
  onEdit,
  onReject,
}: MessengerAiActionCardProps) {
  const [payload, setPayload] = useState<CopilotActionPayload>(action.proposedPayload);
  const [copiedReply, setCopiedReply] = useState(false);

  useEffect(() => {
    setPayload(action.proposedPayload);
  }, [action.id, action.proposedPayload]);

  const meta = ACTION_TYPE_META[action.actionType] || ACTION_TYPE_META.order_edit_items;
  const confPct = Math.round(action.confidence * 100);
  const openOrders = action.openOrdersSnapshot || [];
  const showOrderSwitcher = openOrders.length >= 2 || payload.kind === 'order_edit_items';

  const switchTargetOrder = (orderId: string | null, createNewOrder = false) => {
    if (payload.kind === 'order_edit_items') {
      setPayload({ ...payload, orderId, createNewOrder });
    } else if (payload.kind === 'payment_proof') {
      const amt = payload.totalAmount || 0;
      setPayload({
        ...payload,
        orderId,
        shares: orderId && amt > 0 ? [{ orderId, amount: amt }] : payload.shares,
      });
    } else {
      setPayload({ ...payload, orderId });
    }
  };

  const copyReply = async () => {
    if (!action.draftReply) return;
    try {
      await navigator.clipboard.writeText(action.draftReply);
      setCopiedReply(true);
      setTimeout(() => setCopiedReply(false), 1800);
    } catch {
      // Ignore clipboard permission failure
    }
  };

  return (
    <div className="border border-border rounded-2xl bg-card p-3.5 sm:p-4 space-y-3 text-xs shadow-2xs">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.badgeClass}`}>
              {meta.shortLabel}
            </span>
            <span className="font-bold text-sm text-foreground truncate">
              {action.customerName || `Chat ${action.psid.slice(-4)}`}
            </span>
            <span className="text-[10px] text-muted-foreground">({confPct}% conf.)</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Approval First
            </span>
          </div>
          <div className="text-[11px] font-medium text-foreground/90">{action.summaryTaglish}</div>
        </div>

        <Link
          href={`/dashboard/chat?psid=${encodeURIComponent(action.psid)}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/70 hover:bg-muted border border-border text-[11px] font-semibold shrink-0"
        >
          <span>Open Chat</span>
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Chat Excerpt + Optional Photo */}
      <div className="bg-muted/40 border border-border/60 rounded-xl p-2.5 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Customer Message Burst
        </div>
        <p className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">
          &ldquo;{action.chatExcerpt}&rdquo;
        </p>
        {action.attachmentUrl && (
          <a
            href={action.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 hover:underline font-medium"
          >
            <ImageIcon className="w-3.5 h-3.5" /> View Attached Photo / Receipt
          </a>
        )}
      </div>

      {/* Multi-Order 1-Tap Switcher */}
      {showOrderSwitcher && openOrders.length > 0 && (
        <div className="border border-border/70 rounded-xl p-2.5 space-y-1.5 bg-background">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              {action.ambiguousOrder && <AlertTriangle className="w-3 h-3 text-amber-500" />}
              {openOrders.length > 1 ? `Customer has ${openOrders.length} open orders — pick target:` : 'Target Order:'}
            </span>
          </div>
          <div className="space-y-1">
            {openOrders.map((o) => {
              const selected =
                (payload.kind !== 'order_edit_items' || !payload.createNewOrder) &&
                payload.orderId === o.id;
              return (
                <label
                  key={o.id}
                  className={`flex items-start gap-2 p-1.5 rounded-lg border cursor-pointer text-[11px] transition-colors ${
                    selected ? 'bg-blue-500/10 border-blue-500/40' : 'border-transparent hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`order-${action.id}`}
                    checked={selected}
                    onChange={() => switchTargetOrder(o.id, false)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground">
                      {o.shortId} • {o.paymentMethod} • {o.status}
                      {o.isPrinted ? ' (Printed)' : ''} • Bal ₱{o.balanceDue.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{o.itemsSummary}</div>
                  </div>
                </label>
              );
            })}
            {payload.kind === 'order_edit_items' && (
              <label
                className={`flex items-center gap-2 p-1.5 rounded-lg border cursor-pointer text-[11px] transition-colors ${
                  payload.createNewOrder ? 'bg-emerald-500/10 border-emerald-500/40' : 'border-transparent hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name={`order-${action.id}`}
                  checked={payload.createNewOrder}
                  onChange={() => switchTargetOrder(null, true)}
                />
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  + Gawing Bagong Order (Create New Order instead)
                </span>
              </label>
            )}
          </div>
        </div>
      )}

      {/* Proposed Change Preview */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-2.5 space-y-1 text-[11px]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Proposed CRM Action
        </div>
        {payload.kind === 'order_edit_items' && (
          <div className="space-y-1">
            {payload.items.map((it, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2">
                <span>
                  <strong className="uppercase text-[10px]">{it.op}:</strong> {it.quantity}× {it.productName}
                  {it.replaceProductName ? ` (replaces ${it.replaceProductName})` : ''}
                  {!it.productId && it.op !== 'remove' && (
                    <span className="text-amber-600 font-semibold"> [Pick variant in Edit]</span>
                  )}
                </span>
                {it.unitPrice ? <span>₱{(it.unitPrice * it.quantity).toLocaleString()}</span> : null}
              </div>
            ))}
          </div>
        )}
        {payload.kind === 'order_hold_or_reschedule' && (
          <div>
            Hold <strong>{payload.holdKind}</strong> via <strong className="uppercase">{payload.shipVia}</strong> • Check again on <strong>{payload.checkOn}</strong>
            {payload.note ? ` — "${payload.note}"` : ''}
          </div>
        )}
        {payload.kind === 'order_cancel' && (
          <div className="text-rose-700 dark:text-rose-300">
            Cancel order • Reason: {payload.reason}
          </div>
        )}
        {payload.kind === 'payment_proof' && (
          <div className="space-y-0.5">
            <div>
              <strong>₱{payload.totalAmount.toLocaleString()}</strong> ({payload.paymentMethod})
              {payload.referenceNumber ? ` • Ref: ${payload.referenceNumber}` : ''}
            </div>
            {payload.receiverNote && (
              <div className="text-rose-600 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {payload.receiverNote}
              </div>
            )}
            {payload.shares.length > 0 && (
              <div className="text-muted-foreground">
                Applied to {payload.shares.length} order(s):{' '}
                {payload.shares.map((s) => `#${s.orderId.slice(0, 7).toUpperCase()} (₱${s.amount.toLocaleString()})`).join(', ')}
              </div>
            )}
          </div>
        )}
        {payload.kind === 'payment_promise' && (
          <div>
            Follow up on <strong>{payload.promisedDate}</strong>
            {payload.promisedAmount ? ` (₱${payload.promisedAmount.toLocaleString()})` : ''} — {payload.note}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground pt-0.5">AI note: {action.aiReasoning}</div>
      </div>

      {/* Draft Reply (Copy-Paste for Meta Business Suite) */}
      {action.draftReply && (
        <div className="bg-muted/30 border border-border/60 rounded-xl p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Draft Reply (copy &amp; send in Business Suite)
            </span>
            <button
              type="button"
              onClick={() => void copyReply()}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-background hover:bg-muted border border-border text-[10px] font-semibold"
            >
              {copiedReply ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{copiedReply ? 'Copied!' : 'Copy Reply'}</span>
            </button>
          </div>
          <p className="text-[11px] text-foreground leading-relaxed">{action.draftReply}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(payload)}
          className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{busy ? 'Applying...' : '✓ Tama — Apply'}</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(payload)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-background hover:bg-muted border border-border text-foreground text-xs font-semibold transition-all disabled:opacity-50"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-all disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          <span>Mali</span>
        </button>
      </div>
    </div>
  );
}
