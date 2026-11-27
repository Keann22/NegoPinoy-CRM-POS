'use client';

import React, { useState } from 'react';
import { Bot, RefreshCw, Sparkles, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMessengerAiDashboard } from '@/hooks/useMessengerAiActions';
import type { CopilotActionPayload, MessengerAiAction, MessengerAiErrorCategory } from '@/types';
import { MessengerAiAccuracyPanel } from '@/components/dashboard/messenger-ai/messenger-ai-accuracy-panel';
import { MessengerAiActionCard } from '@/components/dashboard/messenger-ai/messenger-ai-action-card';
import { MessengerAiEditDialog } from '@/components/dashboard/messenger-ai/messenger-ai-edit-dialog';
import { MessengerAiRejectDialog } from '@/components/dashboard/messenger-ai/messenger-ai-reject-dialog';

type TabKey = 'pending' | 'rules' | 'lessons';

export default function ApprovalQueuePage() {
  const { toast } = useToast();
  const {
    data, loading, scanning, busyId, error, reload, scanNow,
    reviewAction, updateRule, toggleLesson, deleteLesson, addAlias, deleteAlias,
  } = useMessengerAiDashboard();

  const [tab, setTab] = useState<TabKey>('pending');
  const [editing, setEditing] = useState<{ action: MessengerAiAction; payload: CopilotActionPayload } | null>(null);
  const [rejecting, setRejecting] = useState<MessengerAiAction | null>(null);

  const handleScan = async () => {
    try {
      const res = await scanNow({ maxBursts: 6, quietSeconds: 0, lookbackHours: 2 });
      if (res.creditError) {
        toast({ variant: 'destructive', title: 'Gemini credits depleted', description: res.creditError });
        return;
      }
      toast({
        title: `Scanned ${res.scannedBursts} chat burst(s)`,
        description: `Created ${res.actionsCreated} check(s), ${res.noActionCount} non-action, ${res.trivialSkipped} trivial skipped.`,
      });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Scan failed', description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleConfirm = async (action: MessengerAiAction, payload: CopilotActionPayload) => {
    try {
      const changed = JSON.stringify(payload) !== JSON.stringify(action.proposedPayload);
      const res = await reviewAction({
        actionId: action.id,
        verdict: changed ? 'edited' : 'correct',
        finalPayload: payload,
      });
      toast({ title: res.appliedSummary || 'Applied & verified' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Could not apply', description: err instanceof Error ? err.message : String(err) });
    }
  };

  const totalReviewed = data?.accuracyByAction.reduce((s, r) => s + r.totalReviewed, 0) ?? 0;
  const totalCorrect = data?.accuracyByAction.reduce((s, r) => s + r.correctCount, 0) ?? 0;
  const overallPct = totalReviewed > 0 ? `${Math.round((totalCorrect / totalReviewed) * 100)}%` : '—';

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-blue-600" />
            Messenger AI Copilot &amp; Accuracy
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Native Gemini + Supabase Copilot (no n8n). Tests chat bursts in Approval First mode, tracks accuracy, and learns from every mistake.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => void handleScan()} disabled={scanning}>
            <Sparkles className={`w-4 h-4 mr-1.5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning Chats...' : 'Scan Recent Chats'}
          </Button>
        </div>
      </div>

      {/* Meta Permission Notice */}
      <div className="flex items-start gap-2 rounded-xl border border-blue-500/25 bg-blue-500/5 px-3.5 py-2.5 text-xs text-blue-800 dark:text-blue-200">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <b>Meta Send permission pending:</b> No messages are sent automatically. Use <b>Copy Reply</b> on any card to paste into Meta Business Suite / Messenger, and turn on <b>Sales Pop-up</b> under Accuracy &amp; Rules once dry-run results look accurate.
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-border rounded-2xl p-3 bg-card">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Pending Checks</div>
          <div className="text-xl font-bold mt-0.5">{data?.pendingActions.length ?? 0}</div>
        </div>
        <div className="border border-border rounded-2xl p-3 bg-card">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Overall Accuracy</div>
          <div className="text-xl font-bold mt-0.5">{overallPct} <span className="text-xs font-normal text-muted-foreground">({totalReviewed} checked)</span></div>
        </div>
        <div className="border border-border rounded-2xl p-3 bg-card">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Active Lessons</div>
          <div className="text-xl font-bold mt-0.5">{data?.lessons.filter((l) => l.active).length ?? 0}</div>
        </div>
        <div className="border border-border rounded-2xl p-3 bg-card">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Product Aliases</div>
          <div className="text-xl font-bold mt-0.5">{data?.aliases.length ?? 0}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
        {[
          { key: 'pending' as const, label: `Pending Checks (${data?.pendingActions.length ?? 0})` },
          { key: 'rules' as const, label: 'Accuracy & Rollout Rules' },
          { key: 'lessons' as const, label: `Mistake Log & Aliases (${(data?.lessons.length ?? 0) + (data?.aliases.length ?? 0)})` },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="py-16 text-center text-xs text-muted-foreground">Loading Copilot dashboard...</div>
      ) : tab === 'pending' ? (
        data && data.pendingActions.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto opacity-80" />
            <div className="font-bold text-sm">No pending Messenger AI checks</div>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Click <b>Scan Recent Chats</b> above to analyze recent unanalyzed Messenger bursts and review what the Copilot proposes.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data?.pendingActions.map((a) => (
              <MessengerAiActionCard
                key={a.id}
                action={a}
                busy={busyId === a.id}
                onConfirm={(p) => void handleConfirm(a, p)}
                onEdit={(p) => setEditing({ action: a, payload: p })}
                onReject={() => setRejecting(a)}
              />
            ))}
          </div>
        )
      ) : data ? (
        <MessengerAiAccuracyPanel
          data={data}
          section={tab === 'rules' ? 'rules' : 'lessons'}
          onUpdateRule={updateRule}
          onToggleLesson={toggleLesson}
          onDeleteLesson={deleteLesson}
          onAddAlias={addAlias}
          onDeleteAlias={deleteAlias}
        />
      ) : null}

      <MessengerAiEditDialog
        action={editing?.action ?? null}
        initialPayload={editing?.payload ?? null}
        open={Boolean(editing)}
        busy={Boolean(editing && busyId === editing.action.id)}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSave={async (editedPayload) => {
          if (!editing) return;
          try {
            const res = await reviewAction({
              actionId: editing.action.id,
              verdict: 'edited',
              finalPayload: editedPayload,
            });
            setEditing(null);
            toast({ title: res.appliedSummary || 'Saved & applied correction' });
          } catch (err) {
            toast({ variant: 'destructive', title: 'Could not apply', description: err instanceof Error ? err.message : String(err) });
          }
        }}
      />

      <MessengerAiRejectDialog
        open={Boolean(rejecting)}
        busy={Boolean(rejecting && busyId === rejecting.id)}
        onOpenChange={(o) => { if (!o) setRejecting(null); }}
        onConfirmReject={async (cat: MessengerAiErrorCategory, note: string | null) => {
          if (!rejecting) return;
          try {
            await reviewAction({ actionId: rejecting.id, verdict: 'rejected', errorCategory: cat, staffNote: note });
            setRejecting(null);
            toast({ title: 'Marked Mali — lesson saved' });
          } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : String(err) });
          }
        }}
      />
    </div>
  );
}
