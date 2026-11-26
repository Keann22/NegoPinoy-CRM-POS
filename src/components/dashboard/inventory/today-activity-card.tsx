'use client';

import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTodayStaffActivity } from '@/hooks/useStaffActivity';

const PH_TZ = 'Asia/Manila';

function phTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function TodayActivityCard() {
  const { data, isLoading } = useTodayStaffActivity();

  const summary = data?.summary;
  const items = data?.items || [];

  const pills: { label: string; count: number }[] = summary
    ? [
        { label: 'Picked', count: summary.byCategory.picking },
        { label: 'Second Check', count: summary.byCategory.checking },
        { label: 'Packed', count: summary.byCategory.packing },
        { label: 'Received', count: summary.byCategory.receiving },
        { label: 'Shelf Counts', count: summary.byCategory.counting },
        { label: 'Transfers', count: summary.byCategory.transfers },
        { label: 'Returns', count: summary.byCategory.returns },
        { label: 'Tasks & Notes', count: summary.byCategory.tasks },
        { label: 'Bus', count: summary.byCategory.shipping },
      ].filter((p) => p.count > 0)
    : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-headline">My Activity Today</CardTitle>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
          <Link href="/dashboard/inventory/my-activity">
            View full history
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !summary || summary.totalActions === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No activity logged yet today. Actions you complete in Picker, Second Check,
            Packer, Receiving, or Recount will appear here.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="font-medium">
                {summary.totalActions} total
              </Badge>
              {pills.map((p) => (
                <Badge key={p.label} variant="outline" className="font-normal">
                  {p.count} {p.label}
                </Badge>
              ))}
            </div>

            <div className="divide-y rounded-md border">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        {item.actionLabel}
                      </span>
                      <span>·</span>
                      <span className="tabular-nums">{phTime(item.timestamp)}</span>
                    </div>
                    <p className="truncate font-medium">{item.title}</p>
                  </div>
                  {item.href && (
                    <Link
                      href={item.href}
                      className="text-xs font-medium text-primary hover:underline shrink-0"
                    >
                      Open
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
