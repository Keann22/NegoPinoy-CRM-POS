'use client';

import React from 'react';
import { Flame, Users, Clock, AlertTriangle } from 'lucide-react';
import { PERSONA_META, type CustomerProfileListItem } from '@/types';

export type PersonaFilterKey =
  | 'all'
  | 'today'
  | 'nanay_home'
  | 'small_negosyo'
  | 'ofw_sender'
  | 'reseller'
  | 'payment_followup'
  | 'profiled';

export function CustomerPersonaFilterBar({
  personaFilter,
  totalProfiled,
  worthMessagingCount,
  onChange,
}: {
  personaFilter: PersonaFilterKey;
  totalProfiled: number;
  worthMessagingCount: number;
  onChange: (key: PersonaFilterKey) => void;
}) {
  const pills: { key: PersonaFilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'today', label: `Worth Messaging Today (${worthMessagingCount})` },
    { key: 'nanay_home', label: 'Nanay / Home' },
    { key: 'small_negosyo', label: 'Small Negosyo' },
    { key: 'ofw_sender', label: 'OFW' },
    { key: 'reseller', label: 'Reseller' },
    { key: 'payment_followup', label: 'Payment Follow-up' },
    { key: 'profiled', label: `Profiled Only (${totalProfiled})` },
  ];

  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          onClick={() => onChange(pill.key)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            personaFilter === pill.key
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/40 hover:bg-muted text-muted-foreground border-border'
          }`}
        >
          {pill.label}
        </button>
      ))}
    </div>
  );
}

export function CustomerPersonaCell({
  profile,
  stoveType,
  familySize,
}: {
  profile: CustomerProfileListItem | undefined;
  stoveType?: string | null;
  familySize?: string | number | null;
}) {
  if (!profile) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center text-sm">
          <Flame className="w-4 h-4 text-orange-500 mr-2 opacity-70" />
          <span className="text-muted-foreground">{stoveType || 'Unknown Stove'}</span>
        </div>
        <div className="flex items-center text-sm">
          <Users className="w-4 h-4 text-blue-500 mr-2 opacity-70" />
          <span className="text-muted-foreground text-xs">Family Size: {familySize || '?'}</span>
        </div>
      </div>
    );
  }

  const pm = PERSONA_META[profile.personaType] || PERSONA_META.other;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pm.badgeClass}`}>
          {pm.shortLabel}
        </span>
        <span className="text-xs font-semibold text-foreground">{profile.personaLabel}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {profile.within24hWindow && (
          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <Clock className="w-3 h-3" /> 24h chat
          </span>
        )}
        {profile.nextActionType === 'payment_followup' && (
          <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-medium">
            <AlertTriangle className="w-3 h-3" /> Follow up
          </span>
        )}
      </div>
    </div>
  );
}
