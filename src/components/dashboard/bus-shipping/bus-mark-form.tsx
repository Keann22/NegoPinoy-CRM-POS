'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { markForBus } from '@/hooks/useBusShipping';
import { actOnTask, useMyTasks, useOrderTasks } from '@/hooks/useStaffTasks';
import type { BusCandidateOrder } from '@/types/bus-shipping.types';
import type { StaffTask } from '@/types/staff-tasks.types';
import { BusOrderPicker } from './bus-order-picker';
import { SuggestionChips } from './suggestion-chips';

interface Props {
  /** Start from this order: its customer's orders are listed and it is ticked. */
  initialOrderId?: string | null;
  /** Optional open task this form was opened from. */
  taskId?: string | null;
  /** Orders to start with (e.g. a suggestion from the notes), already ticked. */
  seedOrders?: BusCandidateOrder[];
  companies: string[];
  destinations: string[];
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Sales: "these orders go by bus". Tick the customer's orders, pick the bus
 * company and station. They then wait on the Waiting for bus list.
 */
export function BusMarkForm({ initialOrderId, taskId, seedOrders, companies, destinations, onDone, onCancel }: Props) {
  const { toast } = useToast();
  const { open: myOpen } = useMyTasks();
  const { tasks: orderTasks } = useOrderTasks(taskId ? initialOrderId : null);
  const plan = seedOrders?.find((o) => o.busPlan)?.busPlan;
  const [orders, setOrders] = useState<BusCandidateOrder[]>(seedOrders || []);
  const [company, setCompany] = useState(plan?.busCompany || '');
  const [destination, setDestination] = useState(plan?.destination || '');
  const [note, setNote] = useState(plan?.note || '');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const linkableTasks = useMemo(() => {
    const selectedIds = new Set(orders.map((o) => o.id));
    if (initialOrderId) selectedIds.add(initialOrderId);
    const map = new Map<string, StaffTask>();
    orderTasks
      .filter((t) => t.status === 'open' && !t.isNote && !t.auto && (!taskId || t.id === taskId))
      .forEach((t) => map.set(t.id, t));
    myOpen
      .filter((t) => t.status === 'open' && !t.isNote && !t.auto && (t.id === taskId || (t.orderId && selectedIds.has(t.orderId))))
      .forEach((t) => { if (!map.has(t.id)) map.set(t.id, t); });
    return Array.from(map.values());
  }, [myOpen, orderTasks, orders, initialOrderId, taskId]);

  const checkedTaskIds = linkableTasks.filter((t) => !excludedIds.has(t.id)).map((t) => t.id);

  const toggleTask = (id: string, checked: boolean) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await markForBus({ orderIds: orders.map((o) => o.id), busCompany: company, destination, note });
      let closedCount = 0;
      if (checkedTaskIds.length > 0) {
        const doneNote = `Marked ${orders.length} order${orders.length === 1 ? '' : 's'} for bus (${company.trim()} — ${destination.trim()})`;
        for (const id of checkedTaskIds) {
          try {
            await actOnTask(id, 'done', { note: doneNote });
            closedCount += 1;
          } catch {
            // Task closing must never block bus marking if already closed.
          }
        }
      }
      const taskNote = closedCount > 0 ? ` · ${closedCount === 1 ? 'Task' : `${closedCount} tasks`} marked Done.` : '';
      toast({ title: 'Marked for bus', description: `${orders.length} order${orders.length === 1 ? '' : 's'} of ${orders[0].customerName}${taskNote}` });
      onDone();
    } catch (e) {
      toast({ title: 'Not saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const canSave = orders.length > 0 && company.trim() && destination.trim();

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">1. Which orders go by bus?</h3>
        <p className="text-xs text-muted-foreground">Tick all the orders that go together. They don’t need to be packed yet.</p>
        <BusOrderPicker mode="mark" initialOrderId={initialOrderId} seedOrders={seedOrders} selected={orders} onChange={setOrders} />
      </section>

      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">2. Which bus and station?</h3>
        <div className="space-y-1">
          <Label>Bus company</Label>
          <Input className="h-11 text-base" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Victory Liner" />
          <SuggestionChips options={companies} value={company} onPick={setCompany} />
        </div>
        <div className="space-y-1">
          <Label>Bus station / terminal</Label>
          <Input className="h-11 text-base" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Binalonan, Pangasinan" />
          <SuggestionChips options={destinations} value={destination} onPick={setDestination} />
        </div>
        <div className="space-y-1">
          <Label>Note for the warehouse (optional)</Label>
          <Input className="h-11 text-base" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. wait for her lay-away to be paid" />
        </div>
      </section>

      {linkableTasks.length > 0 && (
        <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Also mark {linkableTasks.length === 1 ? 'open task' : 'open tasks'} Done when saved
          </div>
          <ul className="space-y-1.5">
            {linkableTasks.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-start gap-2 text-xs">
                  <Checkbox
                    checked={!excludedIds.has(t.id)}
                    onCheckedChange={(v) => toggleTask(t.id, Boolean(v))}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-foreground">{t.message}</span>
                    {t.assigneeName && <span className="text-muted-foreground">For {t.assigneeName}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            The bus company and station are saved as the Done note.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="h-12" onClick={onCancel} disabled={saving}>Back</Button>
        <Button className="h-12 flex-1 text-base" disabled={!canSave || saving} onClick={save}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Mark {orders.length || ''} order{orders.length === 1 ? '' : 's'} for bus
        </Button>
      </div>
    </div>
  );
}
