'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type {
  CopilotActionPayload,
  MessengerAiAction,
  VariantSearchResult,
} from '@/types';
import { MessengerAiPhase2EditFields } from './messenger-ai-phase2-edit-fields';

interface MessengerAiEditDialogProps {
  action: MessengerAiAction | null;
  initialPayload: CopilotActionPayload | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: CopilotActionPayload) => Promise<void>;
}

export function MessengerAiEditDialog({
  action,
  initialPayload,
  open,
  busy,
  onOpenChange,
  onSave,
}: MessengerAiEditDialogProps) {
  const [draft, setDraft] = useState<CopilotActionPayload | null>(initialPayload);
  const [variantQuery, setVariantQuery] = useState('');
  const [variants, setVariants] = useState<VariantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setDraft(initialPayload);
    setVariantQuery('');
    setVariants([]);
  }, [initialPayload, open]);

  useEffect(() => {
    if (!open || !variantQuery.trim()) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/messenger-ai?view=variants&q=${encodeURIComponent(variantQuery.trim())}`);
        if (res.ok) {
          const data = (await res.json()) as { variants?: VariantSearchResult[] };
          setVariants(data.variants || []);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [variantQuery, open]);

  if (!action || !draft) return null;
  const orders = action.openOrdersSnapshot || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(draft);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit AI Proposal — {action.customerName || 'Customer'}</DialogTitle>
          <DialogDescription>
            Adjust the fields below. Your correction teaches the AI for next time.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Target Order Selector */}
          {orders.length > 0 && draft.kind !== 'payment_proof' && (
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Target Order</label>
              <select
                value={draft.kind === 'order_edit_items' && draft.createNewOrder ? '__NEW__' : draft.orderId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (draft.kind === 'order_edit_items') {
                    setDraft(val === '__NEW__' ? { ...draft, orderId: null, createNewOrder: true } : { ...draft, orderId: val || null, createNewOrder: false });
                  } else {
                    setDraft({ ...draft, orderId: val || null });
                  }
                }}
                className="w-full border border-input rounded-lg px-2.5 py-2 bg-background"
              >
                {draft.kind === 'order_edit_items' && (
                  <option value="__NEW__">+ Create New Order</option>
                )}
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.shortId} • {o.paymentMethod} • {o.status} (Bal ₱{o.balanceDue.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Edit Items */}
          {draft.kind === 'order_edit_items' && (
            <div className="space-y-3">
              {draft.createNewOrder && (
                <div className="space-y-1">
                  <label className="font-semibold">New Order Payment Type</label>
                  <select
                    value={draft.newOrderPaymentType || 'COD'}
                    onChange={(e) =>
                      setDraft({ ...draft, newOrderPaymentType: e.target.value as 'COD' | 'Lay-away' | 'Full Payment' })
                    }
                    className="w-full border border-input rounded-lg px-2.5 py-1.5 bg-background"
                  >
                    <option value="COD">COD</option>
                    <option value="Lay-away">Lay-away</option>
                    <option value="Full Payment">Full Payment</option>
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <div className="font-semibold">Items</div>
                {draft.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 border border-border rounded-lg p-2">
                    <select
                      value={it.op}
                      onChange={(e) => {
                        const next = [...draft.items];
                        next[idx] = { ...it, op: e.target.value as 'add' | 'remove' | 'set_qty' | 'swap' };
                        setDraft({ ...draft, items: next });
                      }}
                      className="border border-input rounded px-1.5 py-1 bg-background"
                    >
                      <option value="add">Add</option>
                      <option value="set_qty">Set Qty</option>
                      <option value="swap">Swap</option>
                      <option value="remove">Remove</option>
                    </select>
                    <div className="flex-1 truncate font-medium">{it.productName}</div>
                    <Input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => {
                        const next = [...draft.items];
                        next[idx] = { ...it, quantity: Math.max(1, Number(e.target.value) || 1) };
                        setDraft({ ...draft, items: next });
                      }}
                      className="w-16 h-7 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) })}
                      className="text-rose-500 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 border-t border-border pt-2">
                <div className="font-semibold flex items-center gap-1">
                  <Search className="w-3.5 h-3.5" /> Add / Swap Product Variant
                </div>
                <Input
                  value={variantQuery}
                  onChange={(e) => setVariantQuery(e.target.value)}
                  placeholder="Type product or color/size to search variants..."
                  className="h-8 text-xs"
                />
                {searching && <div className="text-muted-foreground">Searching...</div>}
                {variants.length > 0 && (
                  <div className="max-h-36 overflow-y-auto border border-border rounded-lg divide-y">
                    {variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setDraft({
                            ...draft,
                            items: [
                              ...draft.items,
                              { op: 'add', productId: v.id, productName: v.name, quantity: 1, unitPrice: v.sellingPrice },
                            ],
                          });
                          setVariantQuery('');
                          setVariants([]);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-muted flex items-center justify-between gap-2"
                      >
                        <span className="truncate flex items-center gap-1">
                          <Plus className="w-3 h-3 text-blue-500 shrink-0" /> {v.name}
                        </span>
                        <span className="text-muted-foreground shrink-0">₱{v.sellingPrice} ({v.shelfStock})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Edit Hold */}
          {draft.kind === 'order_hold_or_reschedule' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Reason</label>
                  <select
                    value={draft.holdKind}
                    onChange={(e) => setDraft({ ...draft, holdKind: e.target.value as typeof draft.holdKind })}
                    className="w-full border border-input rounded-lg px-2 py-1.5 bg-background"
                  >
                    <option value="with_orders">Ship with other orders</option>
                    <option value="payment">Waiting for payment</option>
                    <option value="adding">Adding more items</option>
                    <option value="date">Ship on date</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Check-again Date</label>
                  <Input
                    type="date"
                    value={draft.checkOn}
                    onChange={(e) => setDraft({ ...draft, checkOn: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Note</label>
                <Input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* Edit Cancel */}
          {draft.kind === 'order_cancel' && (
            <div>
              <label className="font-semibold block mb-1">Cancel Reason</label>
              <Input
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          )}

          {/* Edit Payment Proof */}
          {draft.kind === 'payment_proof' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Total Amount (₱)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.totalAmount}
                    onChange={(e) => setDraft({ ...draft, totalAmount: Number(e.target.value) || 0 })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Reference #</label>
                  <Input
                    value={draft.referenceNumber || ''}
                    onChange={(e) => setDraft({ ...draft, referenceNumber: e.target.value || null })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold block">Order Shares</label>
                {orders.map((o) => {
                  const share = draft.shares.find((s) => s.orderId === o.id)?.amount ?? 0;
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-2 border border-border rounded-lg p-2">
                      <div className="truncate">
                        <strong>{o.shortId}</strong> ({o.paymentMethod} • Bal ₱{o.balanceDue.toLocaleString()})
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={share}
                        onChange={(e) => {
                          const amt = Math.max(0, Number(e.target.value) || 0);
                          const rest = draft.shares.filter((s) => s.orderId !== o.id);
                          setDraft({ ...draft, shares: amt > 0 ? [...rest, { orderId: o.id, amount: amt }] : rest });
                        }}
                        className="w-24 h-7 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edit Payment Promise */}
          {draft.kind === 'payment_promise' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Promised Date</label>
                  <Input
                    type="date"
                    value={draft.promisedDate}
                    onChange={(e) => setDraft({ ...draft, promisedDate: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Promised Amount (₱)</label>
                  <Input
                    type="number"
                    value={draft.promisedAmount || ''}
                    onChange={(e) => setDraft({ ...draft, promisedAmount: Number(e.target.value) || null })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Note</label>
                <Input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* Phase 2 Actions */}
          <MessengerAiPhase2EditFields draft={draft} orders={orders} setDraft={setDraft} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Save & Apply Correction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
