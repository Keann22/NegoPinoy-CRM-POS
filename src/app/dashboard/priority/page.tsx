'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { OWNER_LABELS, type PriorityGroup, type PriorityOwner, type PriorityRow } from '@/lib/priority/priority-rules';
import { PriorityRowCard } from '@/components/dashboard/priority/priority-row-card';
import { PriorityActionDialog, type PriorityAction } from '@/components/dashboard/priority/priority-action-dialog';

const GROUPS: { key: PriorityGroup; label: string; hint: string }[] = [
  { key: 'ready', label: 'Ready to pack', hint: 'Paid (or COD) and every item is in stock — pick, pack and book.' },
  { key: 'waiting', label: 'Waiting for items', hint: 'Something is OS. The owner shows who has to move next: sales decides, the buyer buys, or it is on the way.' },
  { key: 'prep', label: 'Prep now', hint: 'Lay-aways 80%+ paid. Check stock now so nothing is missing when the last payment comes in.' },
  { key: 'stale', label: 'No activity 30d+', hint: 'Nobody has touched these in 30+ days. Sales: confirm with the customer if we still send it, or cancel the order.' },
  { key: 'hold', label: 'On hold', hint: 'Customer asked to wait, or the order is On-Hold. They come back on their hold date.' },
];

export default function PriorityListPage() {
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const roles = (userProfile?.roles || []).map((r) => String(r).toLowerCase());
  const canEdit = roles.some((r) => ['owner', 'admin', 'sales'].includes(r));

  const [rows, setRows] = useState<PriorityRow[]>([]);
  const [eventsReady, setEventsReady] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [group, setGroup] = useState<PriorityGroup>('ready');
  const [owner, setOwner] = useState<'all' | PriorityOwner>('all');
  const [salesPerson, setSalesPerson] = useState('all');
  const [lateOnly, setLateOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ row: PriorityRow; action: PriorityAction } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/priority', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setRows(data.rows);
      setEventsReady(data.eventsReady);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not load the priority list', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const clearHold = async (row: PriorityRow) => {
    const res = await fetch('/api/priority/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: row.id, kind: 'hold_cleared', note: 'Hold removed' }),
    });
    const data = await res.json();
    if (!res.ok) return toast({ variant: 'destructive', title: 'Could not remove hold', description: data.error });
    toast({ title: 'Hold removed' });
    load();
  };

  // Rank is the order's place in its whole group, so everyone means the same
  // order when they say "#3", whatever filter they have on.
  const ranked = useMemo(() => {
    const byGroup = new Map<PriorityGroup, { row: PriorityRow; rank: number }[]>();
    GROUPS.forEach((g) => byGroup.set(g.key, []));
    rows.forEach((row) => {
      const list = byGroup.get(row.group)!;
      list.push({ row, rank: list.length + 1 });
    });
    return byGroup;
  }, [rows]);

  const salesPeople = useMemo(
    () => Array.from(new Set(rows.map((r) => r.salesPersonName).filter(Boolean) as string[])).sort(),
    [rows]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '');
    return (ranked.get(group) || []).filter(({ row }) =>
      (owner === 'all' || row.owner === owner) &&
      (salesPerson === 'all' || row.salesPersonName === salesPerson) &&
      (!lateOnly || row.daysLate > 0) &&
      (!q || row.id.toLowerCase().startsWith(q) || (row.customerName || '').toLowerCase().includes(q))
    );
  }, [ranked, group, owner, salesPerson, lateOnly, search]);

  const lateCount = (g: PriorityGroup) => (ranked.get(g) || []).filter(({ row }) => row.daysLate > 0).length;
  const hint = GROUPS.find((g) => g.key === group)!.hint;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Priority List</CardTitle>
            <CardDescription>
              Orders we owe customers, ranked. Each one shows who has to act next and when it is due.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </CardHeader>
      </Card>

      {!eventsReady && (
        <Alert>
          <AlertDescription>
            Follow-ups and holds are not set up yet. Run <code>scripts/migrations/add_order_priority_events.sql</code> in the Supabase SQL editor to turn them on. The ranking works without it.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={group} onValueChange={(v) => setGroup(v as PriorityGroup)}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          {GROUPS.map((g) => {
            const total = ranked.get(g.key)?.length || 0;
            const late = lateCount(g.key);
            return (
              <TabsTrigger key={g.key} value={g.key} className="gap-1.5">
                {g.label} <span className="tabular-nums text-muted-foreground">{total}</span>
                {late > 0 && <span className="rounded bg-red-600 px-1.5 text-[11px] font-semibold text-white tabular-nums">{late} late</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <p className="text-sm text-muted-foreground">{hint}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Order # or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={owner} onValueChange={(v) => setOwner(v as any)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {(Object.keys(OWNER_LABELS) as PriorityOwner[]).map((o) => <SelectItem key={o} value={o}>{OWNER_LABELS[o]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={salesPerson} onValueChange={setSalesPerson}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sales</SelectItem>
            {salesPeople.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-1">
          <Switch id="late-only" checked={lateOnly} onCheckedChange={setLateOnly} />
          <Label htmlFor="late-only">Late only</Label>
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing here with these filters.</div>
      ) : (
        <div className="space-y-2">
          {visible.map(({ row, rank }) => (
            <PriorityRowCard
              key={row.id}
              row={row}
              rank={rank}
              canEdit={canEdit && eventsReady}
              onFollowUp={(r) => setDialog({ row: r, action: 'followup' })}
              onHold={(r) => setDialog({ row: r, action: 'hold' })}
              onClearHold={clearHold}
            />
          ))}
        </div>
      )}

      <PriorityActionDialog row={dialog?.row || null} action={dialog?.action || null} onClose={() => setDialog(null)} onSaved={load} />
    </div>
  );
}
