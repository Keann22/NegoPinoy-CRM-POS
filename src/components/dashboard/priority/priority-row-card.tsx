'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Ban, BadgeCheck, ChevronDown, Clock, Flame, MessageSquarePlus, PauseCircle, PlayCircle, Truck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PriorityAction } from './priority-action-dialog';
import {
  BLOCK_REASONS, OS_DECISIONS, OWNER_LABELS, STEP_LABELS, phtDate, isFullyPaid,
  type MissingItem, type MissingState, type PriorityOwner, type PriorityRow,
} from '@/lib/priority/priority-rules';

const peso = (n: number) => `₱${(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(iso));

const OWNER_STYLE: Record<PriorityOwner, string> = {
  warehouse: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  sales: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
  buyer: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  none: 'bg-muted text-muted-foreground',
};

const ITEM_STATE: Record<MissingState, string> = {
  decide: 'OS — waiting for sales to decide',
  remove_item: 'Remove it from the order',
  buy: 'To buy',
  in_transit: 'Bought',
  transit_late: 'Bought — late',
  arrived: 'Arrived',
};

/** "Late 3d" / "Due today" / "Due in 2d" for the current step. */
function timer(row: PriorityRow): { text: string; tone: 'late' | 'today' | 'ok' } | null {
  if (row.group === 'hold') return row.hold ? { text: `Back on ${shortDate(row.hold.until)}`, tone: 'ok' } : null;
  if (!row.dueAt) return null;
  if (row.daysLate > 0) return { text: `Late ${row.daysLate}d`, tone: 'late' };
  const today = phtDate(new Date());
  if (phtDate(row.dueAt) <= today) return { text: 'Due today', tone: 'today' };
  const days = Math.ceil((new Date(row.dueAt).getTime() - Date.now()) / 86400000);
  return { text: `Due in ${days}d`, tone: 'ok' };
}

export type RowAction = PriorityAction | 'clear_hold' | 'unmark' | 'unurgent';

export interface RowPermissions {
  /** Follow-ups and holds (sales, admin, jas). */
  canEdit: boolean;
  /** Mark / remove send today (sales, admin, jas). */
  canMark: boolean;
  /** "Can't send today" (warehouse, admin). */
  canBlock: boolean;
}

interface Props {
  row: PriorityRow;
  rank: number;
  perms: RowPermissions;
  onAction: (row: PriorityRow, action: RowAction) => void;
  onDecide: (row: PriorityRow, item: MissingItem) => void;
}

export function PriorityRowCard({ row, rank, perms, onAction, onDecide }: Props) {
  const { canEdit, canMark, canBlock } = perms;
  const today = phtDate(new Date());
  const [showWhy, setShowWhy] = useState(false);
  const t = timer(row);
  // "Fully paid today / 2 days ago" for the first 3 days, so a newly paid order is impossible to miss.
  const paidBadge = isFullyPaid(row) && row.daysSincePaid != null && row.daysSincePaid <= 3
    ? (row.daysSincePaid === 0 ? 'Fully paid today' : `Fully paid ${row.daysSincePaid}d ago`)
    : null;
  const shortId = row.id.slice(0, 7).toUpperCase();

  return (
    <div className={cn('rounded-lg border bg-card p-3 sm:p-4', row.daysLate > 0 && 'border-red-300 dark:border-red-900')}>
      <div className="flex gap-3">
        <div className="w-10 shrink-0 text-center">
          <div className="text-xl font-bold tabular-nums">{rank}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">{row.score} pts</div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {(row.urgent || paidBadge) && (
            <div className="flex flex-wrap gap-1.5">
              {row.urgent && (
                <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                  <Flame className="h-3 w-3" />Nagmamadali
                </span>
              )}
              {paidBadge && (
                <span className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
                  <BadgeCheck className="h-3 w-3" />{paidBadge}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/dashboard/orders/${row.id}`} className="font-semibold hover:underline">#{shortId}</Link>
            <span className="truncate">{row.customerName || 'Unknown customer'}</span>
            <span className="text-sm text-muted-foreground">· {peso(row.totalAmount)} · {row.paymentMethod || '—'}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {row.salesPersonName || 'No sales person'} · Status: {row.status}
            {row.paidAt && <> · {row.paymentMethod === 'COD' ? 'Ordered' : 'Fully paid'} {shortDate(row.paidAt)}</>}
            {!row.paidAt && row.totalAmount > 0 && <> · {Math.round((row.amountPaid / row.totalAmount) * 100)}% paid</>}
            {row.itemCount > 1 && <> · <span className={cn(row.readyCount < row.itemCount && 'font-medium text-foreground')}>{row.readyCount} of {row.itemCount} items ready</span></>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded px-2 py-0.5 text-xs font-medium', OWNER_STYLE[row.owner])}>{OWNER_LABELS[row.owner]}</span>
            <span className="text-sm font-medium">{STEP_LABELS[row.step]}</span>
            {row.sendToday && row.group !== 'send_today' && (
              <Badge variant="outline" className="gap-1"><Truck className="h-3 w-3" />Send {row.sendToday.date <= today ? 'today' : shortDate(`${row.sendToday.date}T12:00:00+08:00`)}</Badge>
            )}
            {t && (
              <Badge variant={t.tone === 'late' ? 'destructive' : 'outline'} className={cn('gap-1', t.tone === 'today' && 'border-amber-500 text-amber-700 dark:text-amber-300')}>
                <Clock className="h-3 w-3" />{t.text}
              </Badge>
            )}
          </div>

          {row.missing.length > 0 && (
            <ul className="space-y-0.5 text-sm">
              {row.missing.map((m) => (
                <li key={m.productId} className="flex flex-wrap items-center gap-x-2">
                  <span>{m.qty}× {m.name}</span>
                  <span className="text-muted-foreground">
                    — {ITEM_STATE[m.state]}
                    {m.state === 'decide' && ` since ${shortDate(m.since)}`}
                    {(m.state === 'in_transit' || m.state === 'transit_late') && m.eta && `, ETA ${shortDate(m.eta)}`}
                    {m.stageLabel && ` (${m.stageLabel})`}
                    {m.state === 'arrived' && ` ${shortDate(m.since)}`}
                  </span>
                  {m.borrowedFor && (
                    <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
                      · borrowed for <Link href={`/dashboard/orders/${m.borrowedFor.toOrderId}`} className="underline">#{m.borrowedFor.toOrderId.slice(0, 7).toUpperCase()}</Link> by {m.borrowedFor.byName}, {shortDate(m.borrowedFor.at)}
                    </span>
                  )}
                  {m.decision && (
                    <span className="text-xs text-muted-foreground">
                      · {OS_DECISIONS[m.decision.kind]} ({m.decision.byName}{m.decision.note ? `: “${m.decision.note}”` : ''})
                    </span>
                  )}
                  {m.state === 'remove_item' && (
                    <Link href={`/dashboard/orders/${row.id}`} className="text-xs font-medium text-primary underline">Edit order</Link>
                  )}
                  {canMark && (m.state === 'decide' || m.decision) && (
                    <Button size="sm" variant={m.state === 'decide' ? 'default' : 'ghost'} className="h-6 px-2 text-xs" onClick={() => onDecide(row, m)}>
                      {m.state === 'decide' ? 'Decide' : 'Change'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {row.urgent && (
            <div className="text-xs text-red-700 dark:text-red-300">Nagmamadali: “{row.urgent.note}” — {row.urgent.byName}, {shortDate(row.urgent.at)}</div>
          )}
          {row.sendToday && (
            <div className="text-xs text-muted-foreground">Send today: “{row.sendToday.note}” — {row.sendToday.byName}</div>
          )}
          {row.sendTodayBlock && (
            <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-900 dark:bg-red-950 dark:text-red-200">
              Couldn&apos;t send today — {BLOCK_REASONS[row.sendTodayBlock.reason]}
              {row.sendTodayBlock.note && `: “${row.sendTodayBlock.note}”`} ({row.sendTodayBlock.byName})
            </div>
          )}

          {(row.followUps > 0 || row.hold) && (
            <div className="text-xs text-muted-foreground">
              {row.followUps > 0 && row.lastFollowUp && (
                <div>Followed up {row.followUps}× · last: “{row.lastFollowUp.note}” — {row.lastFollowUp.byName}, {shortDate(row.lastFollowUp.at)}</div>
              )}
              {row.hold && <div>Hold: “{row.hold.note}” — {row.hold.byName}</div>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {canBlock && row.group === 'send_today' && (
              <Button size="sm" variant="outline" className="h-8 border-red-300 text-red-700 dark:text-red-300" onClick={() => onAction(row, 'block')}>
                <Ban className="mr-1.5 h-4 w-4" />Can&apos;t send today
              </Button>
            )}
            {canMark && !row.sendToday && row.group !== 'hold' && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => onAction(row, 'send_today')}>
                <Truck className="mr-1.5 h-4 w-4" />Send today
              </Button>
            )}
            {canMark && row.sendToday && (
              <Button size="sm" variant="ghost" className="h-8" onClick={() => onAction(row, 'unmark')}>
                <X className="mr-1.5 h-4 w-4" />Remove send today
              </Button>
            )}
            {canEdit && !row.urgent && (
              <Button size="sm" variant="outline" className="h-8 border-red-300 text-red-700 dark:text-red-300" onClick={() => onAction(row, 'urgent')}>
                <Flame className="mr-1.5 h-4 w-4" />Nagmamadali
              </Button>
            )}
            {canEdit && row.urgent && (
              <Button size="sm" variant="ghost" className="h-8" onClick={() => onAction(row, 'unurgent')}>
                <X className="mr-1.5 h-4 w-4" />Not in a hurry
              </Button>
            )}
            {canEdit && row.group !== 'hold' && (
              <>
                <Button size="sm" variant="outline" className="h-8" onClick={() => onAction(row, 'followup')}>
                  <MessageSquarePlus className="mr-1.5 h-4 w-4" />Customer followed up
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => onAction(row, 'hold')}>
                  <PauseCircle className="mr-1.5 h-4 w-4" />Hold
                </Button>
              </>
            )}
            {canEdit && row.hold && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => onAction(row, 'clear_hold')}>
                <PlayCircle className="mr-1.5 h-4 w-4" />Remove hold
              </Button>
            )}
            {row.scoreParts.length > 0 && (
              <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => setShowWhy((v) => !v)}>
                Why this rank <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', showWhy && 'rotate-180')} />
              </Button>
            )}
          </div>

          {showWhy && (
            <ul className="rounded-md bg-muted/50 p-2 text-xs">
              {row.scoreParts.map((p) => (
                <li key={p.label} className="flex justify-between gap-4">
                  <span>{p.label}</span><span className="tabular-nums">+{p.points}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
