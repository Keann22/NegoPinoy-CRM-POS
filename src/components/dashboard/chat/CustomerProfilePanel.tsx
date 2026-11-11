'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  User,
  Phone,
  MapPin,
  Flame,
  Users,
  CreditCard,
  Tag,
  FileText,
  Save,
  CheckCircle2,
  Package,
  Pencil,
  Check,
  X,
  Link2,
  ExternalLink,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { ChatAvatar } from './ChatSidebar';
import { CustomerMatchBanner, LinkCustomerAccountDialog } from './CustomerMatchBanner';
import { CustomerOrdersTab } from './CustomerOrdersTab';
import { AddCustomerDialog } from '@/components/dashboard/add-customer-dialog';
import type {
  CustomerDossier,
  CustomerOrderSummary,
  MatchedCustomerCandidate,
} from '@/types';

interface CustomerProfilePanelProps {
  psid: string | null;
  threadName?: string | null;
  customerDetail: CustomerDossier | null;
  orders: CustomerOrderSummary[];
  matchedCandidates?: MatchedCustomerCandidate[];
  loading: boolean;
  linkingAccount?: boolean;
  savingNotes: boolean;
  onSaveNotes: (notes: string) => Promise<void>;
  onUpdateCustomer?: (updates: Partial<CustomerDossier>) => Promise<void>;
  onLinkToCustomerAccount?: (customerId: string) => Promise<boolean>;
  onDismissCandidate?: (customerId: string) => void;
  onReloadDossier?: () => void;
  onCreateOrder?: () => void;
}

export function CustomerProfilePanel({
  psid,
  threadName,
  customerDetail,
  orders,
  matchedCandidates = [],
  loading,
  linkingAccount = false,
  savingNotes,
  onSaveNotes,
  onUpdateCustomer,
  onLinkToCustomerAccount,
  onDismissCandidate,
  onReloadDossier,
  onCreateOrder,
}: CustomerProfilePanelProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'orders'>('profile');
  const [noteDraft, setNoteDraft] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editAccountOpen, setEditAccountOpen] = useState(false);

  useEffect(() => {
    setNoteDraft(customerDetail?.ai_summary_notes || '');
  }, [customerDetail?.ai_summary_notes, psid]);

  useEffect(() => {
    setNameDraft(customerDetail?.full_name || threadName || '');
    setIsEditingName(false);
  }, [customerDetail?.full_name, threadName, psid]);

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

  const name = customerDetail?.full_name || threadName || `Customer-${psid.slice(-4)}`;
  const isFullPosAccount = Boolean(
    customerDetail?.address_line || customerDetail?.city || orders.length > 0
  );
  const displayAddress =
    [
      customerDetail?.street_address,
      customerDetail?.barangay || customerDetail?.location_barangay,
      customerDetail?.city || customerDetail?.location_city,
      customerDetail?.province || customerDetail?.location_province,
    ]
      .filter(Boolean)
      .join(', ') ||
    customerDetail?.address_line ||
    'No address on file';

  const calculatedOrderSpend = orders
    .filter((o) => o.status !== 'Cancelled' && o.status !== 'Returned')
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const lifetimeSpend = Math.max(
    Number(customerDetail?.total_lifetime_spend || 0),
    calculatedOrderSpend
  );

  return (
    <div className="w-80 md:w-88 border-l border-border flex flex-col bg-card/60 shrink-0 h-full overflow-hidden">
      {/* Profile Header */}
      <div className="p-4 border-b border-border bg-muted/20 text-center space-y-2.5 shrink-0">
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
              <h3 className="font-bold text-sm text-foreground truncate max-w-[190px]">
                {name}
              </h3>
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
                customerDetail?.suki_tier?.toUpperCase() === 'VIP'
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/20'
                  : customerDetail?.suki_tier?.toUpperCase() === 'REGULAR'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                  : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
              }`}
            >
              {customerDetail?.suki_tier || 'Newbie'}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                isFullPosAccount
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}
            >
              {isFullPosAccount ? '✓ Account Linked' : 'Chat Lead Only'}
            </span>
          </div>
        </div>

        {/* Account Connection Action Buttons */}
        <div className="flex items-center justify-center gap-1.5 pt-0.5 flex-wrap">
          {customerDetail?.id && isFullPosAccount && (
            <Link
              href={`/dashboard/customers/${customerDetail.id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-all shadow-2xs"
            >
              <span>View Account</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setEditAccountOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background hover:bg-muted border border-border text-foreground text-[11px] font-semibold transition-all"
          >
            <UserPlus className="w-3 h-3 text-blue-500" />
            <span>{isFullPosAccount ? 'Edit Account' : 'Complete Account'}</span>
          </button>
          {onLinkToCustomerAccount && (
            <button
              type="button"
              onClick={() => setLinkDialogOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background hover:bg-muted border border-border text-foreground text-[11px] font-semibold transition-all"
              title="Link this chat to an existing POS customer account"
            >
              <Link2 className="w-3 h-3 text-emerald-500" />
              <span>{isFullPosAccount ? 'Re-link' : 'Link to Account'}</span>
            </button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex p-0.5 bg-muted/70 rounded-xl text-[11px] font-semibold text-muted-foreground mt-1">
          <button
            type="button"
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
            type="button"
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
        ) : (
          <>
            {/* Possible Match on File Prompt */}
            {onLinkToCustomerAccount && onDismissCandidate && (
              <CustomerMatchBanner
                chatName={name}
                candidates={matchedCandidates}
                linking={linkingAccount}
                onConfirmLink={onLinkToCustomerAccount}
                onDismissCandidate={onDismissCandidate}
              />
            )}

            {activeTab === 'profile' ? (
              <>
                {/* Lifetime Spend & Store Credit Card */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      Lifetime Spend
                    </span>
                    <div className="text-base font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                      ₱{lifetimeSpend.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Wallet className="w-3 h-3" /> Store Credit
                    </span>
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                      ₱{Number(customerDetail?.store_credit || 0).toLocaleString()}
                    </div>
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
                      <span className="truncate">
                        {customerDetail?.mobile_number || 'No phone recorded'}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-foreground">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="leading-snug">{displayAddress}</span>
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
                      <span className="font-semibold">
                        {customerDetail?.stove_type || 'Unspecified'}
                      </span>
                    </div>
                    {customerDetail?.family_size && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-blue-500" />
                          Household:
                        </span>
                        <span className="font-semibold">
                          {customerDetail.family_size} Members
                        </span>
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
              <CustomerOrdersTab
                customerName={name}
                orders={orders}
                onCreateOrder={onCreateOrder}
              />
            )}
          </>
        )}
      </div>

      {/* Link to Existing Customer Account Modal */}
      {onLinkToCustomerAccount && (
        <LinkCustomerAccountDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          chatName={name}
          psid={psid}
          linking={linkingAccount}
          onSelectCustomer={onLinkToCustomerAccount}
        />
      )}

      {/* Complete / Edit Customer Account Dialog */}
      {editAccountOpen && (
        <AddCustomerDialog
          open={editAccountOpen}
          onOpenChange={setEditAccountOpen}
          initialName={!name.startsWith('Customer-') ? name : ''}
          customerToEdit={
            customerDetail?.id
              ? {
                  ...customerDetail,
                  fullName: customerDetail.full_name || name,
                  mobileNumber: customerDetail.mobile_number || '',
                  city: customerDetail.city || customerDetail.location_city || '',
                  barangay:
                    customerDetail.barangay || customerDetail.location_barangay || '',
                }
              : undefined
          }
          onSuccess={async (saved) => {
            setEditAccountOpen(false);
            if (!customerDetail?.id && onLinkToCustomerAccount && saved?.id) {
              await onLinkToCustomerAccount(saved.id);
            } else {
              onReloadDossier?.();
            }
          }}
        />
      )}
    </div>
  );
}
