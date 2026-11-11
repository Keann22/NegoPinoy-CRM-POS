'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  User,
  Package,
  Pencil,
  Check,
  X,
  Link2,
  ExternalLink,
  UserPlus,
} from 'lucide-react';
import { ChatAvatar } from './ChatSidebar';
import { CustomerMatchBanner, LinkCustomerAccountDialog } from './CustomerMatchBanner';
import { CustomerInfoTab } from './CustomerInfoTab';
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
  onUnlinkAccount?: () => Promise<boolean>;
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
  onUnlinkAccount,
  onDismissCandidate,
  onReloadDossier,
  onCreateOrder,
}: CustomerProfilePanelProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'orders'>('profile');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editAccountOpen, setEditAccountOpen] = useState(false);

  useEffect(() => {
    setNameDraft(customerDetail?.full_name || threadName || '');
    setIsEditingName(false);
  }, [customerDetail?.full_name, threadName, psid]);

  const handleSaveName = async () => {
    if (!nameDraft.trim() || !onUpdateCustomer) return;
    await onUpdateCustomer({ full_name: nameDraft.trim() });
    setIsEditingName(false);
  };

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
          {onLinkToCustomerAccount && !isFullPosAccount && (
            <button
              type="button"
              onClick={() => setLinkDialogOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background hover:bg-muted border border-border text-foreground text-[11px] font-semibold transition-all"
              title="Link this chat to an existing POS customer account"
            >
              <Link2 className="w-3 h-3 text-emerald-500" />
              <span>Link to Account</span>
            </button>
          )}
          {onUnlinkAccount && isFullPosAccount && customerDetail?.id && (
            <button
              type="button"
              onClick={() => onUnlinkAccount()}
              disabled={linkingAccount}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background hover:bg-muted border border-border text-muted-foreground text-[11px] font-semibold transition-all disabled:opacity-50"
              title="Wrong person? Disconnect this chat from the account"
            >
              <X className="w-3 h-3 text-red-500" />
              <span>Disconnect chat</span>
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
              <CustomerInfoTab
                psid={psid}
                customerDetail={customerDetail}
                lifetimeSpend={lifetimeSpend}
                displayAddress={displayAddress}
                savingNotes={savingNotes}
                onSaveNotes={onSaveNotes}
              />
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
