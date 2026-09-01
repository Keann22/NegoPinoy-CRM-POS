'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Phone,
  MapPin,
  Flame,
  Users,
  CreditCard,
  Tag,
  FileText,
  ShoppingBag,
  Save,
  CheckCircle2,
  Package,
  PlusCircle,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { ChatAvatar } from './ChatSidebar';
import type { CustomerDossier, CustomerOrderSummary } from '@/types';

interface CustomerProfilePanelProps {
  psid: string | null;
  customerDetail: CustomerDossier | null;
  orders: CustomerOrderSummary[];
  loading: boolean;
  savingNotes: boolean;
  onSaveNotes: (notes: string) => Promise<void>;
  onUpdateCustomer?: (updates: Partial<CustomerDossier>) => Promise<void>;
  onCreateOrder?: () => void;
}

export function CustomerProfilePanel({
  psid,
  customerDetail,
  orders,
  loading,
  savingNotes,
  onSaveNotes,
  onUpdateCustomer,
  onCreateOrder,
}: CustomerProfilePanelProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'orders'>('profile');
  const [noteDraft, setNoteDraft] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    setNoteDraft(customerDetail?.ai_summary_notes || '');
  }, [customerDetail?.ai_summary_notes, psid]);

  useEffect(() => {
    setNameDraft(customerDetail?.full_name || '');
    setIsEditingName(false);
  }, [customerDetail?.full_name, psid]);

  const handleSaveNotes = async () => {
    await onSaveNotes(noteDraft);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleSaveName = async () => {
    if (!nameDraft.trim() || !onUpdateCustomer) return;
    await onUpdateCustomer({ full_name: nameDraft.trim() });
    setIsEditingName(false);
  };

  const painTags = useMemo(() => {
    if (!customerDetail?.pain_points) return [];
    try {
      if (typeof customerDetail.pain_points === 'string') {
        const parsed = JSON.parse(customerDetail.pain_points);
        return Array.isArray(parsed) ? parsed : Object.keys(parsed);
      }
      if (typeof customerDetail.pain_points === 'object') {
        return Object.keys(customerDetail.pain_points);
      }
      return [];
    } catch {
      return [];
    }
  }, [customerDetail?.pain_points]);

  if (!psid) {
    return (
      <div className="w-80 md:w-88 border-l border-border bg-card/60 p-6 flex flex-col items-center justify-center text-center text-muted-foreground shrink-0 h-full">
        <User className="w-8 h-8 opacity-30 mb-2" />
        <p className="text-xs">No customer selected.</p>
      </div>
    );
  }

  const name = customerDetail?.full_name || `Customer-${psid.slice(-4)}`;

  return (
    <div className="w-80 md:w-88 border-l border-border flex flex-col bg-card/60 shrink-0 h-full overflow-hidden">
      {/* Profile Header */}
      <div className="p-4 border-b border-border bg-muted/20 text-center space-y-2 shrink-0">
        <div className="flex justify-center">
          <ChatAvatar name={name} psid={psid} size={52} />
        </div>
        <div>
          {isEditingName ? (
            <div className="flex items-center justify-center gap-1.5 max-w-[220px] mx-auto">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Enter customer name"
                className="text-xs font-semibold bg-background border border-input rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                title="Save name"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="p-1 bg-muted text-muted-foreground rounded hover:bg-muted/80"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 group">
              <h3 className="font-bold text-sm text-foreground truncate max-w-[180px]">{name}</h3>
              {onUpdateCustomer && (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="text-muted-foreground/50 group-hover:text-muted-foreground hover:text-foreground p-0.5 rounded transition-all"
                  title="Edit customer name"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                customerDetail?.suki_tier === 'VIP'
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/20'
                  : customerDetail?.suki_tier === 'Regular'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                  : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
              }`}
            >
              {customerDetail?.suki_tier || 'Newbie'}
            </span>
            {customerDetail?.preferred_honorific && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {customerDetail.preferred_honorific}
              </span>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex p-0.5 bg-muted/70 rounded-xl text-[11px] font-semibold text-muted-foreground mt-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-1 rounded-lg transition-all ${
              activeTab === 'profile'
                ? 'bg-background text-foreground shadow-xs'
                : 'hover:text-foreground'
            }`}
          >
            👤 Info & CRM
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-1 rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'orders'
                ? 'bg-background text-foreground shadow-xs'
                : 'hover:text-foreground'
            }`}
          >
            <Package className="w-3 h-3" />
            <span>Orders ({orders.length})</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading customer details...
          </div>
        ) : activeTab === 'profile' ? (
          <>
            {/* Lifetime Spend Card */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Lifetime Spend
              </span>
              <div className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                ₱{Number(customerDetail?.total_lifetime_spend || 0).toLocaleString()}
              </div>
            </div>

            {/* Contact Details */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Contact & Address
              </div>
              <div className="bg-background border border-border/60 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-foreground">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{customerDetail?.mobile_number || 'No phone recorded'}</span>
                </div>
                <div className="flex items-start gap-2 text-foreground">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="leading-snug">
                    {[
                      customerDetail?.street_address,
                      customerDetail?.location_barangay,
                      customerDetail?.location_city,
                      customerDetail?.location_province,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'No address on file'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-foreground">
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span>{customerDetail?.preferred_payment || 'COD / GCash'}</span>
                </div>
              </div>
            </div>

            {/* Kitchen Profile */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Kitchen Profile
              </div>
              <div className="bg-background border border-border/60 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    Stove Type:
                  </span>
                  <span className="font-semibold">{customerDetail?.stove_type || 'Unspecified'}</span>
                </div>
                {customerDetail?.family_size && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-500" />
                      Household:
                    </span>
                    <span className="font-semibold">{customerDetail.family_size} Members</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags / Pain Points */}
            {painTags.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Tags & Preferences
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {painTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-semibold px-2 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Internal Staff Notes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Staff Internal Notes
                </span>
                {savedSuccess && (
                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 animate-fade-in">
                    <CheckCircle2 className="w-3 h-3" /> Saved!
                  </span>
                )}
              </div>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Type customer notes here (e.g. wants morning delivery, suki customer)..."
                rows={3}
                className="w-full text-xs bg-background border border-input rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none text-foreground placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingNotes ? 'Saving...' : 'Save Notes'}</span>
              </button>
            </div>
          </>
        ) : (
          /* Orders Tab */
          <div className="space-y-3">
            {onCreateOrder && (
              <button
                type="button"
                onClick={onCreateOrder}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Create Order for {name.split(' ')[0]}</span>
              </button>
            )}

            {orders.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground bg-background rounded-2xl border border-dashed border-border space-y-2">
                <ShoppingBag className="w-6 h-6 mx-auto opacity-40" />
                <p>No recorded orders yet for this customer.</p>
              </div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  className="bg-background border border-border/80 rounded-2xl p-3 space-y-2 shadow-2xs text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-foreground">
                      {order.order_number || `#${order.id.slice(0, 7)}`}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        order.status === 'Completed' || order.status === 'Payment Received (COD)'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : order.status === 'Cancelled'
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>

                  {/* Order items */}
                  <div className="space-y-1 py-1 border-y border-border/40 text-[11px]">
                    {order.order_items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-muted-foreground">
                        <span className="truncate pr-2">
                          {item.quantity}× {item.product_name}
                        </span>
                        <span className="font-medium text-foreground shrink-0">
                          ₱{Number(item.unit_price * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ₱{Number(order.total_amount || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
