'use client';

import React, { useState } from 'react';
import { Award, PauseCircle, PlayCircle, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ACTION_TYPE_META,
  ERROR_CATEGORY_META,
  type MessengerAiAccuracyRow,
  type MessengerAiActionType,
  type MessengerAiDashboardData,
  type MessengerAiErrorCategory,
  type VariantSearchResult,
} from '@/types';

interface MessengerAiAccuracyPanelProps {
  data: MessengerAiDashboardData;
  section: 'rules' | 'lessons';
  onUpdateRule: (actionType: MessengerAiActionType, patch: Record<string, unknown>) => Promise<void>;
  onToggleLesson: (lessonId: string, active: boolean) => Promise<void>;
  onDeleteLesson: (lessonId: string) => Promise<void>;
  onAddAlias: (phrase: string, productId: string, productName: string) => Promise<void>;
  onDeleteAlias: (aliasId: string) => Promise<void>;
}

export function MessengerAiAccuracyPanel({
  data,
  section,
  onUpdateRule,
  onToggleLesson,
  onDeleteLesson,
  onAddAlias,
  onDeleteAlias,
}: MessengerAiAccuracyPanelProps) {
  const [phrase, setPhrase] = useState('');
  const [varQuery, setVarQuery] = useState('');
  const [varResults, setVarResults] = useState<VariantSearchResult[]>([]);
  const [selectedVar, setSelectedVar] = useState<VariantSearchResult | null>(null);
  const [savingAlias, setSavingAlias] = useState(false);

  const accuracyMap = new Map<MessengerAiActionType, MessengerAiAccuracyRow>(
    data.accuracyByAction.map((a) => [a.actionType, a])
  );

  const searchVariants = async (q: string) => {
    setVarQuery(q);
    if (!q.trim()) {
      setVarResults([]);
      return;
    }
    const res = await fetch(`/api/messenger-ai?view=variants&q=${encodeURIComponent(q.trim())}`);
    if (res.ok) {
      const json = (await res.json()) as { variants?: VariantSearchResult[] };
      setVarResults(json.variants || []);
    }
  };

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phrase.trim() || !selectedVar) return;
    setSavingAlias(true);
    try {
      await onAddAlias(phrase.trim(), selectedVar.id, selectedVar.name);
      setPhrase('');
      setVarQuery('');
      setSelectedVar(null);
      setVarResults([]);
    } finally {
      setSavingAlias(false);
    }
  };

  if (section === 'rules') {
    return (
      <div className="space-y-4">
        <div className="border border-border rounded-2xl overflow-hidden bg-card">
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm">Action Rules &amp; Accuracy Scoreboard</h3>
              <p className="text-xs text-muted-foreground">
                Start in <b>Approval First</b> with <b>Sales Pop-up OFF</b> while testing. Toggle Sales Pop-up ON once ready, and graduate to Auto-Apply at 95%+ accuracy (30+ checks).
              </p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {data.rules.map((rule) => {
              const acc = accuracyMap.get(rule.actionType);
              const meta = ACTION_TYPE_META[rule.actionType];
              const pct = acc && acc.totalReviewed > 0 ? Math.round(acc.accuracyRate * 100) : null;
              return (
                <div key={rule.actionType} className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-1 min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta?.badgeClass || ''}`}>
                        Phase {rule.phase}
                      </span>
                      <span className="font-bold text-foreground">{rule.label}</span>
                      {acc?.graduationReady && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                          <Award className="w-3 h-3" /> Ready for Auto-Apply
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {acc && acc.totalReviewed > 0 ? (
                        <span>
                          <b>{pct}%</b> accurate ({acc.correctCount} ✓, {acc.editedCount} ✎, {acc.rejectedCount} ✗ of {acc.totalReviewed})
                        </span>
                      ) : (
                        <span>No reviewed checks yet • {meta?.description}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onUpdateRule(rule.actionType, { enabled: !rule.enabled })}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                        rule.enabled
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {rule.enabled ? 'Scanner ON' : 'Scanner OFF'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void onUpdateRule(rule.actionType, { showSalesPopup: !rule.showSalesPopup })}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                        rule.showSalesPopup
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {rule.showSalesPopup ? 'Sales Pop-up ON' : 'Sales Pop-up OFF'}
                    </button>

                    <button
                      type="button"
                      disabled={rule.phase > 1}
                      onClick={() =>
                        void onUpdateRule(rule.actionType, {
                          mode: rule.mode === 'stage_confirm' ? 'auto_apply' : 'stage_confirm',
                        })
                      }
                      className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold disabled:opacity-40"
                    >
                      {rule.mode === 'auto_apply' ? 'Auto-Apply' : 'Approval First'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {data.topErrorCategories.length > 0 && (
          <div className="border border-border rounded-2xl p-4 bg-card space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Top Mistake Reasons</h4>
            <div className="flex flex-wrap gap-2">
              {data.topErrorCategories.map((e) => {
                const label = ERROR_CATEGORY_META[e.category as MessengerAiErrorCategory]?.label || e.category;
                return (
                  <span key={e.category} className="text-xs px-3 py-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 font-medium">
                    {label}: <b>{e.count}</b>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Mistake Lessons */}
      <div className="border border-border rounded-2xl bg-card p-4 space-y-3">
        <div>
          <h3 className="font-bold text-sm">Mistake Lessons ({data.lessons.length})</h3>
          <p className="text-xs text-muted-foreground">
            Automatically saved when staff edit or reject a proposal. Active lessons are injected into future AI checks.
          </p>
        </div>
        {data.lessons.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No mistake lessons recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {data.lessons.map((l) => (
              <div key={l.id} className={`border rounded-xl p-2.5 text-xs space-y-1.5 ${l.active ? 'border-border bg-background' : 'border-border/50 bg-muted/30 opacity-60'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[11px]">{ACTION_TYPE_META[l.actionType]?.shortLabel || l.actionType} • {l.verdict}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onToggleLesson(l.id, !l.active)}
                      className="p-1 hover:bg-muted rounded"
                      title={l.active ? 'Pause lesson' : 'Activate lesson'}
                    >
                      {l.active ? <PauseCircle className="w-3.5 h-3.5 text-amber-500" /> : <PlayCircle className="w-3.5 h-3.5 text-emerald-500" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteLesson(l.id)}
                      className="p-1 hover:bg-muted rounded text-rose-500"
                      title="Delete lesson"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-foreground/90">{l.lessonText}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Slang Aliases */}
      <div className="border border-border rounded-2xl bg-card p-4 space-y-3">
        <div>
          <h3 className="font-bold text-sm">Learned Product Aliases ({data.aliases.length})</h3>
          <p className="text-xs text-muted-foreground">
            Maps customer slang or nicknames directly to an exact product variant.
          </p>
        </div>

        <form onSubmit={handleAddAlias} className="space-y-2 border border-border rounded-xl p-2.5 bg-muted/20 text-xs">
          <div className="font-semibold text-[11px]">Teach New Slang Alias</div>
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder='Customer phrase (e.g. "malaking kaldero")'
            className="h-8 text-xs"
          />
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={selectedVar ? selectedVar.name : varQuery}
              onChange={(e) => {
                setSelectedVar(null);
                void searchVariants(e.target.value);
              }}
              placeholder="Search exact variant..."
              className="h-8 text-xs pl-8"
            />
          </div>
          {varResults.length > 0 && !selectedVar && (
            <div className="max-h-28 overflow-y-auto border border-border rounded-lg bg-background divide-y">
              {varResults.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setSelectedVar(v);
                    setVarResults([]);
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted text-[11px]"
                >
                  {v.name} (₱{v.sellingPrice})
                </button>
              ))}
            </div>
          )}
          <Button type="submit" size="sm" disabled={savingAlias || !phrase.trim() || !selectedVar} className="w-full h-7 text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" /> Save Alias
          </Button>
        </form>

        <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
          {data.aliases.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 border border-border/70 rounded-lg px-2.5 py-1.5 text-xs">
              <div className="min-w-0">
                <div className="font-semibold truncate">&ldquo;{a.phraseNormalized}&rdquo; → {a.productName}</div>
                <div className="text-[10px] text-muted-foreground">{a.source} • {a.hitCount} hit(s)</div>
              </div>
              <button
                type="button"
                onClick={() => void onDeleteAlias(a.id)}
                className="text-rose-500 hover:bg-muted p-1 rounded shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
