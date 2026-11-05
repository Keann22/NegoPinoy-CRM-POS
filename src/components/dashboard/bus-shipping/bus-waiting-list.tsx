'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Bus, Loader2, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { unmarkForBus } from '@/hooks/useBusShipping';
import type { BusCandidateOrder, BusQueueGroup, BusSuggestion } from '@/types/bus-shipping.types';

const phTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

interface Props {
  groups: BusQueueGroup[];
  suggestions: BusSuggestion[];
  loading: boolean;
  /** Open the mark form, optionally starting from one order. */
  onMark: (orderId?: string) => void;
  onEdit: (group: BusQueueGroup) => void;
  /** At the terminal: record the fee for this group's ready orders. */
  onRecord: (group: BusQueueGroup) => void;
  onChanged: () => void;
}

function OrderLine({ o, onRemove, busy }: { o: BusCandidateOrder; onRemove?: () => void; busy?: boolean }) {
  return (
    <li className="flex items-start gap-2 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <Link href={`/dashboard/orders/${o.id}`} className="font-mono font-semibold text-primary hover:underline">#{o.shortId}</Link>
          {o.canShip ? (
            <span className="rounded bg-emerald-100 px-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">Ready · {o.status}</span>
          ) : (
            <span className="rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">{o.blockedReason || o.status}</span>
          )}
        </span>
        <span className="line-clamp-1 text-xs text-muted-foreground" title={o.items}>{o.items}</span>
      </span>
      {onRemove && (
        <button type="button" onClick={onRemove} disabled={busy} title="Not by bus" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </button>
      )}
    </li>
  );
}

/** Orders that go by bus, one card per customer + bus + station; and notes that say bus but aren't marked. */
export function BusWaitingList({ groups, suggestions, loading, onMark, onEdit, onRecord, onChanged }: Props) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const suggestionsByCustomer = useMemo(() => {
    const map = new Map<string, BusSuggestion[]>();
    for (const s of suggestions) {
      const key = s.order.customerId || s.order.id;
      map.set(key, [...(map.get(key) || []), s]);
    }
    return [...map.values()];
  }, [suggestions]);

  const remove = async (o: BusCandidateOrder) => {
    if (!confirm(`#${o.shortId} is not going by bus anymore?`)) return;
    setBusyId(o.id);
    try {
      await unmarkForBus(o.id);
      onChanged();
    } catch (e) {
      toast({ title: 'Not saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const readyGroups = groups.filter((g) => g.orders.some((o) => o.canShip)).length;

  return (
    <div className="space-y-4">
      <Button className="h-12 w-full text-base" onClick={() => onMark()}>
        <Plus className="mr-2 h-5 w-5" /> Mark orders for bus
      </Button>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No orders are marked for bus. Sales: tap “Mark orders for bus” when a customer wants bus shipping.</p>
      )}
      {groups.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {groups.length} customer{groups.length === 1 ? '' : 's'} waiting · {readyGroups} with orders ready to go
        </p>
      )}

      {groups.map((g) => {
        const ready = g.orders.filter((o) => o.canShip);
        return (
          <div key={g.key} className="space-y-2 rounded-md border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{g.customerName}</p>
                <p className="flex items-center gap-1 text-sm font-medium text-sky-800 dark:text-sky-300">
                  <Bus className="h-4 w-4 shrink-0" /> {g.busCompany} → {g.destination}
                </p>
                <p className="text-xs text-muted-foreground">Marked{g.requestedBy ? ` by ${g.requestedBy}` : ''}, {phTime(g.requestedAt)}</p>
                {g.note && <p className="text-xs italic text-muted-foreground">“{g.note}”</p>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => onEdit(g)} title="Change orders, bus or station">
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <ul className="divide-y">
              {g.orders.map((o) => (
                <OrderLine key={o.id} o={o} busy={busyId === o.id} onRemove={() => remove(o)} />
              ))}
            </ul>
            {ready.length < g.orders.length && ready.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {g.orders.length - ready.length} order{g.orders.length - ready.length === 1 ? ' is' : 's are'} not ready yet. Ship the ready ones only if sales says so.
              </p>
            )}
            <Button className="w-full" variant={ready.length ? 'default' : 'outline'} disabled={ready.length === 0} onClick={() => onRecord(g)}>
              {ready.length === 0 ? 'Not ready yet' : `Paid the bus? Record fee (${ready.length} order${ready.length === 1 ? '' : 's'})`}
            </Button>
          </div>
        );
      })}

      {suggestionsByCustomer.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">Notes say bus, but not marked yet</p>
          <p className="text-xs text-muted-foreground">Sales: check these and mark them with the bus and station.</p>
          {suggestionsByCustomer.map((list) => (
            <div key={list[0].order.customerId || list[0].order.id} className="space-y-1 rounded-md border border-dashed p-3">
              <div className="flex items-center gap-2">
                <p className="flex-1 font-medium">{list[0].order.customerName}</p>
                <Button size="sm" variant="outline" onClick={() => onMark(list[0].order.id)}>Mark for bus</Button>
              </div>
              <ul className="divide-y">
                {list.map((s) => (
                  <li key={s.order.id} className="py-1.5 text-sm">
                    <Link href={`/dashboard/orders/${s.order.id}`} className="font-mono font-semibold text-primary hover:underline">#{s.order.shortId}</Link>
                    <span className="ml-2 text-xs text-muted-foreground">{s.order.status}</span>
                    <span className="block text-xs italic text-muted-foreground">“{s.hint}”</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
