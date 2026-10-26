'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flame, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { JAS_EMAILS, type PriorityRow } from '@/lib/priority/priority-rules';
import { PriorityActionDialog } from '@/components/dashboard/priority/priority-action-dialog';

type Urgent = { note: string | null; byName: string | null; at: string } | null;

/** "Nagmamadali" on the order page: shows the mark, and lets sales/admin/jas set or clear it. */
export function UrgentOrderButton({ orderId, customerName }: { orderId: string; customerName?: string | null }) {
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const roles = (userProfile?.roles || []).map((r) => String(r).toLowerCase());
  const canMark = roles.some((r) => ['owner', 'admin', 'sales'].includes(r))
    || JAS_EMAILS.includes((userProfile?.email || '').toLowerCase().trim());

  const [urgent, setUrgent] = useState<Urgent>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/priority/urgent?orderId=${orderId}`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setUrgent((await res.json()).urgent);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const clear = async () => {
    const res = await fetch('/api/priority/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, kind: 'urgent_cleared', note: 'No longer in a hurry' }),
    });
    const data = await res.json();
    if (!res.ok) return toast({ variant: 'destructive', title: 'Could not save', description: data.error });
    toast({ title: 'No longer nagmamadali' });
    load();
  };

  if (urgent) {
    return (
      <div className="flex items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white" title={`“${urgent.note}” — ${urgent.byName}`}>
          <Flame className="h-3.5 w-3.5" />Nagmamadali
        </span>
        {canMark && (
          <Button variant="ghost" size="sm" className="h-8" onClick={clear}><X className="mr-1 h-4 w-4" />Not in a hurry</Button>
        )}
      </div>
    );
  }

  if (!canMark) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="border-red-300 text-red-700 dark:text-red-300" onClick={() => setOpen(true)}>
        <Flame className="mr-2 h-4 w-4" />Nagmamadali
      </Button>
      <PriorityActionDialog
        row={open ? ({ id: orderId, customerName: customerName || null } as PriorityRow) : null}
        action={open ? 'urgent' : null}
        onClose={() => setOpen(false)}
        onSaved={load}
      />
    </>
  );
}
