'use client';

import Link from 'next/link';
import { ArrowRight, Loader2, PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSupplierPrompts } from '@/hooks/useSupplierFlags';
import { cn } from '@/lib/utils';
import { SupplierPromptCard } from './supplier-prompt-card';

/**
 * Dashboard & page card for orders waiting on an item out at the supplier.
 * Shows the exact same actionable prompts as SupplierStockPopup so sales agents
 * and owners can work through them without waiting for the pop-up.
 */
export function SupplierPromptsCard({
  hideWhenEmpty = false,
  showAllLink = true,
  onAnswered,
}: {
  hideWhenEmpty?: boolean;
  showAllLink?: boolean;
  onAnswered?: () => void;
}) {
  const { prompts, loading, busyKey, answer, openOrder } = useSupplierPrompts({ onAnswered });

  if (hideWhenEmpty && !loading && prompts.length === 0) return null;

  return (
    <Card className={cn(prompts.length > 0 && 'border-amber-400 dark:border-amber-600')}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageX className={cn('h-5 w-5', prompts.length > 0 ? 'text-amber-600' : 'text-muted-foreground')} />
              Out at supplier: ask the customer
              {prompts.length > 0 && (
                <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold text-white">{prompts.length}</span>
              )}
            </CardTitle>
            <CardDescription>
              We can&apos;t buy these items right now. Ask each customer, then answer here. Paid orders are first.
            </CardDescription>
          </div>
          {showAllLink && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/inventory/supplier-stock">
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : prompts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders waiting for your answer right now.</p>
        ) : (
          <ul className="space-y-3">
            {prompts.map((p) => (
              <SupplierPromptCard key={p.key} p={p} busy={busyKey === p.key} onAnswer={answer} onOpenOrder={openOrder} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
