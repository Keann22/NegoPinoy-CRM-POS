'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Phone,
  MapPin,
  Flame,
  Users,
  CreditCard,
  Tag,
  FileText,
  Save,
  CheckCircle2,
  Wallet,
} from 'lucide-react';
import type { CustomerDossier } from '@/types';

interface CustomerInfoTabProps {
  psid: string;
  customerDetail: CustomerDossier | null;
  lifetimeSpend: number;
  displayAddress: string;
  savingNotes: boolean;
  onSaveNotes: (notes: string) => Promise<void>;
}

export function CustomerInfoTab({
  psid,
  customerDetail,
  lifetimeSpend,
  displayAddress,
  savingNotes,
  onSaveNotes,
}: CustomerInfoTabProps) {
  const [noteDraft, setNoteDraft] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setNoteDraft(customerDetail?.ai_summary_notes || '');
  }, [customerDetail?.ai_summary_notes, psid]);

  const handleSaveNotes = async () => {
    await onSaveNotes(noteDraft);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
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

  return (
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
  );
}
