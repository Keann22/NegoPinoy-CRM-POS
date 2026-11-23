'use client';

import Link from 'next/link';
import { ArrowRight, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useReadyToPick } from '@/hooks/useReadyToPick';
import { useUserProfile } from '@/hooks/useUserProfile';

/** Temporary shortcut inside Tasks for Jas, warehouse staff, and owners to clear Picked (with issue) orders with stock. */
export function ReadyToPickBanner() {
  const { userProfile } = useUserProfile();
  const roles = (userProfile?.roles || []).map((r) => String(r).toLowerCase());
  const canSee = roles.some((r) => ['owner', 'admin', 'inventory'].includes(r));
  const { data, isLoading } = useReadyToPick(canSee);

  if (!canSee) return null;

  const pwiCount = data?.pickedWithIssue.length ?? 0;
  const procCount = data?.processing.length ?? 0;

  return (
    <Card className="border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-start gap-3">
          <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="space-y-0.5">
            <p className="font-semibold">
              Picked (with issue) — May Stock na sa Warehouse
              {!isLoading && data && (
                <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                  {pwiCount} ready
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {isLoading && !data
                ? 'Checking warehouse shelf stock…'
                : `${pwiCount} Picked (with issue) orders ready to finish${procCount > 0 ? ` · ${procCount} Processing orders also ready` : ''}. Check order form, pick, then continue normal workflow.`}
            </p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/tasks/ready-to-pick">
            Open List <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
