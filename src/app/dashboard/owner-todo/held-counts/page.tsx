'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { HeldPickerCountCard } from '@/components/dashboard/held-picker-count-card';
import { useHeldPickerCounts } from '@/hooks/useOwnerTodo';
import { useRoleCheck } from '@/hooks/useRoleCheck';

/**
 * Owner to-do → "Picker counted more than the shelf: decide". Every held picker
 * count on one page (before, each one could only be opened from its bell).
 */
export default function HeldCountsPage() {
  const { isManagement, isLoading } = useRoleCheck();
  const { held, error } = useHeldPickerCounts();

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!isManagement) return <p className="p-6 text-sm text-muted-foreground">Owners only.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Picker counted more than the shelf</h1>
        <p className="text-sm text-muted-foreground">
          The extra pieces were not added to stock. For each one: record the purchase (Receiving then counts it in),
          add the pieces if the system was wrong, or ignore it if it was the wrong item.
        </p>
      </div>
      {!held && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {held && held.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting. All decided.</p>}
      {held?.map((h) => <HeldPickerCountCard key={h.id} initial={h} />)}
    </div>
  );
}
