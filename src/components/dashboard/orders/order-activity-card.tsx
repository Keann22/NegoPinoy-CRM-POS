'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { format } from 'date-fns';
import {
  Activity,
  MessageSquare,
  PackageX,
  Send,
  Loader2,
  Clock,
  User,
  RefreshCw,
  FileText,
  AtSign,
  X
} from 'lucide-react';
import { MentionInput } from '@/components/dashboard/mention-input';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import {
  createStaffMessage,
  resolveRecipientNames
} from '@/lib/services/staff-message-service';
import {
  fetchOrderTrail,
  addOrderNote,
  type OrderTrailEntry,
  type OrderTrailEntryKind
} from '@/lib/services/order-trail-service';

interface OrderActivityCardProps {
  orderId: string;
}

type FilterTab = 'all' | 'notes' | 'trail';

const ENTRY_STYLES: Record<OrderTrailEntryKind, {
  dot: string;
  badgeBg: string;
  badgeText: string;
  icon: typeof MessageSquare;
  label: string;
}> = {
  status: {
    dot: 'bg-indigo-500',
    badgeBg: 'bg-indigo-50 border-indigo-200',
    badgeText: 'text-indigo-700',
    icon: Activity,
    label: 'Status Change',
  },
  note: {
    dot: 'bg-blue-500',
    badgeBg: 'bg-blue-50 border-blue-200',
    badgeText: 'text-blue-700',
    icon: MessageSquare,
    label: 'Internal Note',
  },
  issue_reported: {
    dot: 'bg-red-500',
    badgeBg: 'bg-red-50 border-red-200',
    badgeText: 'text-red-700',
    icon: PackageX,
    label: 'Issue Reported',
  },
  issue_message: {
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-50 border-amber-200',
    badgeText: 'text-amber-700',
    icon: MessageSquare,
    label: 'Issue Chat',
  },
};

export function OrderActivityCard({ orderId }: OrderActivityCardProps) {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { staff } = useStaffDirectory();

  const [entries, setEntries] = useState<OrderTrailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const loadTrail = useCallback(async () => {
    if (!supabase || !orderId) return;
    try {
      const data = await fetchOrderTrail(supabase, orderId);
      setEntries(data);
    } catch (err) {
      console.error('Failed to load order activity trail:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, orderId]);

  useEffect(() => {
    loadTrail();
  }, [loadTrail]);

  const handlePostNote = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newNoteText.trim() || !supabase || isSubmitting) return;

    setIsSubmitting(true);
    const authorName = userProfile
      ? `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() || userProfile.email || 'Staff'
      : 'Staff';

    try {
      // Find any manually typed @Names matching known staff
      const lowerText = newNoteText.toLowerCase();
      const manuallyTypedNames: string[] = [];
      staff.forEach((s) => {
        if (s.fullName && lowerText.includes(`@${s.fullName.toLowerCase()}`)) {
          manuallyTypedNames.push(s.fullName);
        }
      });

      const allTagged = resolveRecipientNames([...mentions, ...manuallyTypedNames], authorName);
      const orderRef = `Order #${orderId.substring(0, 7).toUpperCase()}`;

      // 1. If staff are tagged, create a staff message thread so it appears in Messages and notifies them
      if (allTagged.length > 0) {
        await createStaffMessage(supabase, {
          issueType: 'order',
          orderId,
          message: newNoteText.trim(),
          senderName: authorName,
          recipientNames: allTagged,
          title: `${authorName} tagged you in a note on ${orderRef}`,
        });
      }

      // 2. Always persist into orders.notes for complete order history
      const res = await addOrderNote(supabase, orderId, newNoteText.trim(), authorName);
      if (res.success) {
        setNewNoteText('');
        setMentions([]);
        await loadTrail();
      }
    } catch (err) {
      console.error('Error posting note / message:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const counts = useMemo(() => {
    let notesCount = 0;
    let trailCount = 0;
    entries.forEach((e) => {
      if (e.kind === 'note' || e.kind === 'issue_message') {
        notesCount++;
      } else {
        trailCount++;
      }
    });
    return { all: entries.length, notes: notesCount, trail: trailCount };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (activeFilter === 'notes') {
      return entries.filter((e) => e.kind === 'note' || e.kind === 'issue_message');
    }
    if (activeFilter === 'trail') {
      return entries.filter((e) => e.kind === 'status' || e.kind === 'issue_reported');
    }
    return entries;
  }, [entries, activeFilter]);

  return (
    <Card id="order-activity" className="shadow-sm border">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Order Activity & Notes</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Consolidated chronological trail of notes, updates, and order status events
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsLoading(true);
                loadTrail();
              }}
              disabled={isLoading}
              title="Refresh timeline"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>

            {/* Filter Tabs */}
            <div className="flex bg-muted p-1 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1 font-medium rounded-md transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({counts.all})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('notes')}
                className={`px-3 py-1 font-medium rounded-md transition-colors ${
                  activeFilter === 'notes'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Notes ({counts.notes})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('trail')}
                className={`px-3 py-1 font-medium rounded-md transition-colors ${
                  activeFilter === 'trail'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Trail ({counts.trail})
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-6">
        {/* Quick Add Note Box with Staff Tagging */}
        <form onSubmit={handlePostNote} className="space-y-3 rounded-lg border bg-slate-50/70 p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              Add Note or Internal Remark
              <span className="text-[11px] text-muted-foreground font-normal">
                (type <kbd className="px-1 py-0.5 bg-muted border rounded font-mono text-[10px]">@</kbd> to tag staff)
              </span>
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              Posting as: <strong className="text-slate-700">{userProfile?.firstName || 'Staff'}</strong>
            </span>
          </div>

          <MentionInput
            value={newNoteText}
            onChange={setNewNoteText}
            mentions={mentions}
            onMentionsChange={setMentions}
            onSubmit={handlePostNote}
            placeholder="Write a note... Type @ to tag staff (they will receive a notification and message thread)..."
            multiline={true}
            rows={2}
            dropdownPosition="top"
            className="bg-white text-sm focus-visible:ring-indigo-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            {mentions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-indigo-600 font-medium">
                  <AtSign className="w-3.5 h-3.5" />
                  Will notify & message:
                </span>
                {mentions.map((name) => (
                  <Badge
                    key={name}
                    variant="secondary"
                    className="gap-1 bg-indigo-50 text-indigo-700 border-indigo-200 text-xs py-0.5 px-2"
                  >
                    @{name}
                    <button
                      type="button"
                      onClick={() => setMentions(mentions.filter((m) => m !== name))}
                      className="hover:text-destructive ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Tip: Tagging staff notifies them instantly and creates a thread in Messages.
              </span>
            )}

            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !newNoteText.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs h-8 px-4 ml-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Post Note
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Timeline List */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span>Loading activity & trail...</span>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-10 border border-dashed rounded-lg text-muted-foreground text-sm">
            {activeFilter === 'notes'
              ? 'No notes added to this order yet. Use the box above to add the first note!'
              : activeFilter === 'trail'
              ? 'No system trail events recorded yet.'
              : 'No activity logged for this order yet.'}
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 pt-1">
            {filteredEntries.map((entry, index) => {
              const style = ENTRY_STYLES[entry.kind] || ENTRY_STYLES.status;
              const Icon = style.icon;
              const isNote = entry.kind === 'note' || entry.kind === 'issue_message';

              return (
                <div key={entry.id} className="relative group">
                  {/* Timeline connector line */}
                  {index !== filteredEntries.length - 1 && (
                    <div className="absolute left-[-15px] top-6 bottom-[-24px] w-[2px] bg-slate-200" />
                  )}

                  {/* Dot indicator */}
                  <div
                    className={`absolute left-[-23px] top-1.5 h-5 w-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${style.dot}`}
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>

                  {/* Timeline entry card */}
                  <div
                    className={`rounded-lg border p-3.5 transition-shadow hover:shadow-sm ${
                      isNote ? 'bg-blue-50/30 border-blue-100' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[11px] px-2 py-0.5 flex items-center gap-1 font-medium ${style.badgeBg} ${style.badgeText}`}
                        >
                          <Icon className="w-3 h-3" />
                          {style.label}
                        </Badge>
                        <span className="font-semibold text-sm text-slate-800">
                          {entry.title}
                        </span>
                      </div>

                      <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" />
                        {format(new Date(entry.createdAt), 'PPp')}
                      </span>
                    </div>

                    {/* Entry message / detail */}
                    {entry.detail && (
                      <div className="text-sm text-slate-700 whitespace-pre-wrap mt-2 mb-2 pl-1 border-l-2 border-slate-300">
                        {entry.detail}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <User className="w-3 h-3" />
                      <span>{entry.kind === 'issue_message' ? 'From: ' : 'By: '}</span>
                      <strong className="text-slate-700 font-medium">
                        {entry.actor || 'System / Unknown'}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
