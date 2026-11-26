'use client';

import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  Bus,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  History,
  ListChecks,
  Package,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ActivityBadgeTone, ActivityCategory, StaffActivityItem } from '@/types';

const PH_TZ = 'Asia/Manila';

const CATEGORY_STYLE: Record<
  ActivityCategory,
  { icon: React.ElementType; className: string }
> = {
  picking: { icon: ClipboardList, className: 'bg-blue-100 text-blue-700' },
  checking: { icon: ShieldCheck, className: 'bg-purple-100 text-purple-700' },
  packing: { icon: Package, className: 'bg-emerald-100 text-emerald-700' },
  receiving: { icon: ArrowDownToLine, className: 'bg-teal-100 text-teal-700' },
  counting: { icon: ListChecks, className: 'bg-amber-100 text-amber-700' },
  transfers: { icon: ArrowRightLeft, className: 'bg-indigo-100 text-indigo-700' },
  returns: { icon: Undo2, className: 'bg-rose-100 text-rose-700' },
  tasks: { icon: ClipboardCheck, className: 'bg-slate-100 text-slate-700' },
  shipping: { icon: Bus, className: 'bg-cyan-100 text-cyan-700' },
};

const BADGE_CLASSES: Record<ActivityBadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  danger: 'bg-red-100 text-red-800 border-red-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
};

function phDayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PH_TZ }).format(new Date(iso));
}

function phDayHeading(dayKey: string): string {
  const todayKey = phDayKey(new Date().toISOString());
  const yestKey = phDayKey(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if (dayKey === todayKey) return 'Today';
  if (dayKey === yestKey) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${dayKey}T12:00:00+08:00`));
}

function phTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

interface ActivityTimelineProps {
  items: StaffActivityItem[];
  totalFiltered: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  showActor: boolean;
  onLoadMore: () => void;
}

export function ActivityTimeline({
  items,
  totalFiltered,
  hasMore,
  isLoading,
  isLoadingMore,
  showActor,
  onLoadMore,
}: ActivityTimelineProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 py-2">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium">No activity found for this filter</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Try widening the date range, clearing the search box, or selecting All Categories.
          </p>
        </CardContent>
      </Card>
    );
  }

  const groups: { dayKey: string; label: string; rows: StaffActivityItem[] }[] = [];
  for (const item of items) {
    const key = phDayKey(item.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.dayKey === key) {
      last.rows.push(item);
    } else {
      groups.push({ dayKey: key, label: phDayHeading(key), rows: [item] });
    }
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.dayKey} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <span className="text-xs text-muted-foreground">
              {group.rows.length} {group.rows.length === 1 ? 'entry' : 'entries'} shown
            </span>
          </div>
          <Card>
            <CardContent className="p-0 divide-y">
              {group.rows.map((item) => {
                const style = CATEGORY_STYLE[item.category];
                const Icon = style.icon;
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        style.className
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">
                          {item.actionLabel}
                        </span>
                        <span>·</span>
                        <span className="tabular-nums">{phTimeLabel(item.timestamp)}</span>
                        {showActor && (
                          <>
                            <span>·</span>
                            <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-normal">
                              {item.actorName}
                            </Badge>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium break-words">{item.title}</span>
                        {item.badges?.map((b, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className={cn('text-[11px] font-medium px-1.5 py-0', BADGE_CLASSES[b.tone])}
                          >
                            {b.label}
                          </Badge>
                        ))}
                      </div>

                      {item.detail && (
                        <p className="text-xs text-muted-foreground break-words">{item.detail}</p>
                      )}
                    </div>

                    {item.href && (
                      <Link
                        href={item.href}
                        className="shrink-0 mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-primary"
                      >
                        <span className="hidden sm:inline">Open</span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ))}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 px-1">
        <p className="text-xs text-muted-foreground">
          Showing {items.length} of {totalFiltered} matching actions
        </p>
        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? 'Loading more...' : 'Load more'}
          </Button>
        )}
      </div>
    </div>
  );
}
