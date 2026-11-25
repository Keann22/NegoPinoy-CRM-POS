'use client';

import React, { useState } from 'react';
import {
  Sparkles, RefreshCw, Copy, Check, Send, AlertTriangle, Lightbulb,
  ShoppingBag, MessageCircleQuestion, ShieldAlert, Clock, Wallet,
} from 'lucide-react';
import { useCustomerPersona } from '@/hooks/useCustomerPersona';
import { NEXT_ACTION_META, PERSONA_META } from '@/types';
import { CustomerPersonaFeedbackBar } from './CustomerPersonaFeedbackBar';

interface CustomerPersonaCardProps {
  customerId?: string | null;
  psid?: string | null;
  mode?: 'full' | 'compact';
  onUseDraft?: (text: string) => void;
}

export function CustomerPersonaCard({
  customerId,
  psid,
  mode = 'full',
  onUseDraft,
}: CustomerPersonaCardProps) {
  const {
    profile, meta, loading, generating, savingFeedback, error, generate, submitFeedback,
  } = useCustomerPersona({ customerId, psid });
  const [copied, setCopied] = useState(false);

  if (!customerId && !psid) return null;

  const handleCopyDraft = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked on some mobile browsers; draft remains selectable.
    }
  };

  if (loading && !profile) {
    return (
      <div className="border border-border rounded-2xl p-4 bg-card text-xs text-muted-foreground flex items-center gap-2">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
        <span>Loading customer persona...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="border-2 border-dashed border-border rounded-2xl p-4 bg-card/60 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Customer Persona & Sales Playbook</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Analyze this customer&apos;s orders and Messenger chats to see who they are, what they want, and the best next message to send.
            </p>
          </div>
        </div>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        <button
          type="button"
          disabled={generating}
          onClick={() => void generate()}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
          <span>{generating ? 'Building Persona...' : 'Build Persona'}</span>
        </button>
      </div>
    );
  }

  const personaMeta = PERSONA_META[profile.personaType] || PERSONA_META.other;
  const actionMeta = NEXT_ACTION_META[profile.nextActionType] || NEXT_ACTION_META.check_in;
  const isCompact = mode === 'compact';
  // Live value from the API (last customer message), never the one saved when the persona was built.
  const within24h = meta.within24hWindow;
  const confPct = Math.round(profile.confidence * 100);
  const isOverdue = profile.nextActionType === 'payment_followup';

  return (
    <div className="border border-border rounded-2xl bg-card p-3.5 sm:p-4 space-y-3 text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${personaMeta.badgeClass}`}>
              {personaMeta.shortLabel}
            </span>
            <span className="font-bold text-sm text-foreground truncate">{profile.personaLabel}</span>
            <span className="text-[10px] text-muted-foreground">({confPct}% fit)</span>
          </div>
          <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-2">
            <span>Based on {profile.sourceOrderCount} order(s) • {profile.sourceMessageCount} chat(s)</span>
            {within24h && (
              <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                <Clock className="w-2.5 h-2.5" /> 24h chat active
              </span>
            )}
            {meta.isStale && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                • New activity ({meta.newOrdersCount} ord / {meta.newMessagesCount} msg)
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={generating}
          onClick={() => void generate()}
          title="Refresh persona from latest orders & chats"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/70 hover:bg-muted border border-border text-[11px] font-semibold text-foreground transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
          <span>{generating ? 'Updating...' : meta.isStale ? 'Update' : 'Refresh'}</span>
        </button>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      {/* Summary */}
      <p className="text-xs text-foreground/90 leading-relaxed">{profile.summary}</p>

      {/* Next Best Action / Draft Message */}
      <div
        className={`rounded-xl border p-3 space-y-2 ${
          isOverdue
            ? 'bg-rose-500/10 border-rose-500/25'
            : 'bg-emerald-500/5 border-emerald-500/20'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 font-bold text-[11px]">
            {isOverdue ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            ) : (
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>Next Best Move</span>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${actionMeta.badgeClass}`}>
            {actionMeta.label}
          </span>
        </div>

        {isOverdue && (
          <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5 shrink-0" />
            <span>
              {profile.metrics.overdueLayawayCount} overdue lay-away/installment (₱{profile.metrics.overdueBalanceTotal.toLocaleString()}). Follow up payment first before pitching new items.
            </span>
          </p>
        )}

        {!isOverdue && profile.recommendedItems.length > 0 && (
          <div className="space-y-1.5">
            {profile.recommendedItems.map((item, idx) => (
              <div key={`${item.productId || idx}`} className="bg-background/80 border border-border/60 rounded-lg px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2 font-semibold text-[11px]">
                  <span className="truncate">{item.productName}</span>
                  {item.price != null && (
                    <span className="text-emerald-600 dark:text-emerald-400 shrink-0">
                      ₱{Number(item.price).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">{item.reason}</div>
              </div>
            ))}
          </div>
        )}

        {profile.draftMessage && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Suggested Message (for sales to edit &amp; send)
            </div>
            <div className="bg-background border border-border/70 rounded-lg p-2 text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">
              {profile.draftMessage}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleCopyDraft(profile.draftMessage!)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background hover:bg-muted border border-border text-[11px] font-semibold"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy Draft'}</span>
              </button>
              {onUseDraft && (
                <button
                  type="button"
                  onClick={() => onUseDraft(profile.draftMessage!)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold"
                >
                  <Send className="w-3 h-3" />
                  <span>Insert into Chat</span>
                </button>
              )}
              {!within24h && (
                <span className="text-[10px] text-muted-foreground">
                  (Outside 24h promo window — check Messenger policy)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* What They Want + Unbought Inquiries */}
      {(profile.interests.length > 0 || profile.unboughtInquiries.length > 0) && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <MessageCircleQuestion className="w-3 h-3" /> What They Want
          </div>
          {profile.interests.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {profile.interests.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {profile.unboughtInquiries.length > 0 && (
            <div className="space-y-1 pt-0.5">
              {profile.unboughtInquiries.slice(0, isCompact ? 3 : 6).map((inq, i) => (
                <div key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>
                    <strong className="text-foreground">{inq.item}</strong>
                    {inq.context ? ` — ${inq.context}` : ''}
                    {inq.wasOutOfStock ? ' (was out of stock)' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Life & Business Clues */}
      {profile.lifeClues.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Lightbulb className="w-3 h-3 text-amber-500" /> Life &amp; Business Clues
          </div>
          <ul className="space-y-1">
            {profile.lifeClues.slice(0, isCompact ? 3 : 6).map((c, i) => (
              <li key={i} className="text-[11px] leading-snug">
                <span className="font-semibold text-foreground">{c.clue}</span>
                <span className="text-muted-foreground"> — {c.evidence}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Buying DNA & Sales Tips */}
      <div className={`grid gap-2 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        <div className="bg-muted/30 border border-border/60 rounded-xl p-2.5 space-y-1 text-[11px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Buying Style
          </div>
          <div><span className="text-muted-foreground">Payment:</span> <strong>{profile.buyingStyle.paymentPreference}</strong></div>
          <div><span className="text-muted-foreground">Shipping:</span> <strong>{profile.buyingStyle.shippingPreference}</strong></div>
          <div><span className="text-muted-foreground">Price Tier:</span> <strong className="capitalize">{profile.buyingStyle.priceTier}</strong></div>
          {profile.buyingStyle.paydayPattern && (
            <div><span className="text-muted-foreground">Payday:</span> <strong>{profile.buyingStyle.paydayPattern}</strong></div>
          )}
          <div><span className="text-muted-foreground">Tone:</span> {profile.buyingStyle.communicationStyle}</div>
        </div>

        {(profile.salesTips.length > 0 || profile.objectionsAndPainPoints.length > 0) && (
          <div className="bg-muted/30 border border-border/60 rounded-xl p-2.5 space-y-1.5 text-[11px]">
            {profile.salesTips.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  How to Sell to Them
                </div>
                {profile.salesTips.slice(0, isCompact ? 2 : 4).map((tip, i) => (
                  <div key={i} className="text-foreground/90">• {tip}</div>
                ))}
              </div>
            )}
            {profile.objectionsAndPainPoints.length > 0 && (
              <div className="space-y-0.5 pt-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Watch Out For
                </div>
                {profile.objectionsAndPainPoints.slice(0, isCompact ? 2 : 5).map((obj, i) => (
                  <div key={i} className="text-muted-foreground">• {obj}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Staff Accuracy Check */}
      <CustomerPersonaFeedbackBar
        currentPersonaType={profile.personaType}
        staffVerdict={profile.staffVerdict}
        staffCorrectionNote={profile.staffCorrectionNote}
        staffVerifiedBy={profile.staffVerifiedBy}
        busy={savingFeedback}
        onSubmitFeedback={submitFeedback}
      />
    </div>
  );
}
