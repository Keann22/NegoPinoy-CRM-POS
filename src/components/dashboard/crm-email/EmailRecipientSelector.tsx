'use client';

import { Users, User, Mail, Search, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CrmEmailRecipient } from '@/types/crm-email.types';

interface EmailRecipientSelectorProps {
  recipientMode: 'tier' | 'single' | 'manual';
  setRecipientMode: (mode: 'tier' | 'single' | 'manual') => void;
  selectedTier: 'all' | 'vip' | 'regular' | 'newbie';
  setSelectedTier: (tier: 'all' | 'vip' | 'regular' | 'newbie') => void;
  customers: CrmEmailRecipient[];
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  manualEmail: string;
  setManualEmail: (email: string) => void;
  manualName: string;
  setManualName: (name: string) => void;
  tierCounts: { all: number; vip: number; regular: number; newbie: number };
  activeCount: number;
  isLoading: boolean;
}

export function EmailRecipientSelector({
  recipientMode,
  setRecipientMode,
  selectedTier,
  setSelectedTier,
  customers,
  selectedCustomerId,
  setSelectedCustomerId,
  manualEmail,
  setManualEmail,
  manualName,
  setManualName,
  tierCounts,
  activeCount,
  isLoading,
}: EmailRecipientSelectorProps) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              1. Select Recipients
            </CardTitle>
            <CardDescription className="text-xs">
              Target by customer loyalty tier, pick an individual suki, or enter an email.
            </CardDescription>
          </div>
          <Badge variant={activeCount > 0 ? 'default' : 'secondary'} className="text-xs">
            {activeCount} Recipient{activeCount === 1 ? '' : 's'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        {/* Mode Selector */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-muted/40 rounded-lg border text-sm">
          <button
            type="button"
            onClick={() => setRecipientMode('tier')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md font-medium text-xs transition-colors ${
              recipientMode === 'tier'
                ? 'bg-background shadow-xs text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Tier Segment
          </button>
          <button
            type="button"
            onClick={() => setRecipientMode('single')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md font-medium text-xs transition-colors ${
              recipientMode === 'single'
                ? 'bg-background shadow-xs text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Single Suki
          </button>
          <button
            type="button"
            onClick={() => setRecipientMode('manual')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md font-medium text-xs transition-colors ${
              recipientMode === 'manual'
                ? 'bg-background shadow-xs text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            Manual Email
          </button>
        </div>

        {/* Tier Mode */}
        {recipientMode === 'tier' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {(
              [
                { id: 'all', label: 'All Emails', count: tierCounts.all, color: 'text-slate-700' },
                { id: 'vip', label: 'VIP Tier', count: tierCounts.vip, color: 'text-amber-600' },
                { id: 'regular', label: 'Regular Tier', count: tierCounts.regular, color: 'text-blue-600' },
                { id: 'newbie', label: 'Newbie Tier', count: tierCounts.newbie, color: 'text-emerald-600' },
              ] as const
            ).map((item) => {
              const active = selectedTier === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedTier(item.id)}
                  className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
                    active
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-muted-foreground/30 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">{item.label}</span>
                    {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <span className={`text-lg font-bold mt-1 ${item.color}`}>
                    {isLoading ? '...' : item.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Single Customer Mode */}
        {recipientMode === 'single' && (
          <div className="space-y-2 pt-1">
            <Label className="text-xs">Choose Customer ({customers.length} registered emails)</Label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Search or select a customer..." />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center justify-between gap-3 text-left">
                      <span className="font-medium text-xs">{c.name}</span>
                      <span className="text-[11px] text-muted-foreground">{c.email}</span>
                      <span className="text-[10px] uppercase font-mono px-1 rounded bg-muted">
                        {c.sukiTier}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Manual Email Mode */}
        {recipientMode === 'manual' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient Email</Label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Name (Optional)</Label>
              <Input
                type="text"
                placeholder="Juan Dela Cruz"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
