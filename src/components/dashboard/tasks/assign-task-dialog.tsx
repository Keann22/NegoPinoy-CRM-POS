'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ClipboardCheck, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { createStaffTask, useOrderShipContext, useTaskPeople } from '@/hooks/useStaffTasks';
import { ShipContextBlock, owedOf } from '@/components/dashboard/orders/ship-context-block';
import type { OrderShipContext } from '@/lib/services/order-ship-context-service';
import { shipsBeforePaid } from '@/lib/priority/priority-rules';
import { OrderSearch } from '@/components/dashboard/order-search';
import { dueFromPick, phtDateString, type DuePick } from '@/lib/services/staff-tasks/task-dates';
import { useUser } from '@/lib/supabase/hooks';
import { cn } from '@/lib/utils';

export interface TaskOrderRef { id: string; label: string }

const DUE_PICKS: { value: DuePick; label: string }[] = [
  { value: 'none', label: 'No deadline' },
  { value: 'hour', label: 'Within 1 hour' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'date', label: 'Pick a date' },
];

/** Common order tasks, one tap to fill in (the owners' usual Messenger messages). */
const ORDER_QUICK_TEXT = ['OK to ship', 'Please pick and book', 'Please check the order'];

/** ₱3,352.90, or ₱2,000 for whole pesos. */
const peso = (n: number) => {
  const v = n || 0;
  const cents = Math.round(v * 100) % 100 !== 0;
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
};

/** A task that tells staff to send or book the order. */
const SHIP_WORDS = /ipadala|padala|i-?book|ship/i;

/**
 * Why "OK to ship" may be wrong for this order (found 2026-11-24: #020106B
 * was held for the customer's other orders, which still owed ₱3,352.90).
 */
function shipWarnings(ctx: OrderShipContext): string[] {
  const out: string[] = [];
  if (ctx.hold) out.push(`Sales marked it not for shipping yet: "${ctx.hold.reason}"`);
  const owed = owedOf(ctx);
  // COD and installments normally ship unpaid (the courier collects); only a
  // held one (e.g. going by bus, which doesn't collect) needs paying first.
  if (owed > 0 && (!shipsBeforePaid(ctx.paymentMethod) || ctx.hold)) out.push(`This order has ${peso(owed)} balance unpaid${ctx.paymentMethod === 'COD' ? ' (COD)' : ''}.`);
  const othersOwed = ctx.others.reduce((s, o) => s + owedOf(o), 0);
  if (ctx.hold && othersOwed > 0) out.push(`The customer's other open orders have ${peso(othersOwed)} balance unpaid.`);
  return out;
}

const chip = (active: boolean) => cn(
  'rounded-full border px-3 py-1.5 text-sm transition-colors',
  active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from an order: it's attached and can't be changed. */
  order?: TaskOrderRef | null;
  onCreated?: () => void;
  /** "Task for me" (owner, 2026-11-25): starts with yourself picked. */
  forSelf?: boolean;
  /** Optional prefilled task text (e.g. from Packed Orders → Ask Sales). */
  defaultMessage?: string;
  /** Optional staff name to pre-select when opening. */
  defaultAssigneeName?: string | null;
}

/** Owners give a staff member a task, optionally about an order, with an optional deadline. */
export function AssignTaskDialog({
  open,
  onOpenChange,
  order: fixedOrder,
  onCreated,
  forSelf = false,
  defaultMessage = '',
  defaultAssigneeName = null,
}: Props) {
  const { toast } = useToast();
  const { user } = useUser();
  const allPeople = useTaskPeople(open);
  // You (your own accounts) come first, as "Me": a task to yourself is a reminder
  // that stays on your dashboard until you tap Done.
  const myKey = allPeople.find((p) => !!user?.uid && p.key.split(',').includes(user.uid))?.key || null;
  const people = myKey
    ? [{ ...allPeople.find((p) => p.key === myKey)!, name: 'Me', roles: [] }, ...allPeople.filter((p) => p.key !== myKey)]
    : allPeople;
  const [pickedKeys, setPickedKeys] = useState<string[] | null>(null);
  const [message, setMessage] = useState(defaultMessage);
  const [pickedOrder, setPickedOrder] = useState<TaskOrderRef | null>(null);
  const [due, setDue] = useState<DuePick>('none');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && defaultMessage) setMessage(defaultMessage);
  }, [open, defaultMessage]);

  const matchedDefaultKey = defaultAssigneeName
    ? allPeople.find((p) => p.name.trim().toLowerCase() === defaultAssigneeName.trim().toLowerCase())?.key || null
    : null;

  // Nobody tapped yet: "Task for me" starts with you picked; otherwise optional default assignee.
  const personKeys = pickedKeys ?? (forSelf && myKey ? [myKey] : matchedDefaultKey ? [matchedDefaultKey] : []);
  const onlyMe = personKeys.length === 1 && personKeys[0] === myKey;

  const order = fixedOrder || pickedOrder;
  const shipContext = useOrderShipContext(open ? order?.id : null);
  const warnings = shipContext && SHIP_WORDS.test(message) ? shipWarnings(shipContext) : [];
  const canSave = personKeys.length > 0 && message.trim().length > 0 && (due !== 'date' || !!dueDate);

  const close = (next: boolean) => {
    if (!next) {
      setPickedKeys(null); setMessage(''); setPickedOrder(null); setDue('none'); setDueDate('');
    }
    onOpenChange(next);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createStaffTask({ personKeys, message: message.trim(), orderId: order?.id || null, dueAt: dueFromPick(due, dueDate) });
      const who = onlyMe ? 'yourself' : people.filter((p) => personKeys.includes(p.key)).map((p) => p.name).join(', ') || 'Staff';
      toast(onlyMe
        ? { title: 'Added to your tasks', description: 'It stays on your dashboard until you tap Done.' }
        : { title: `Task sent to ${who}`, description: 'They get a pop-up. You get a bell when it\'s done.' });
      onCreated?.();
      close(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Task not sent', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> {forSelf ? 'Task for me' : 'Assign a task'}</DialogTitle>
          <DialogDescription>
            {onlyMe
              ? 'A reminder for yourself: it stays on your dashboard until you tap Done (and pops up if it passes the deadline).'
              : 'They get a pop-up, then it stays on their dashboard until they tap Done.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Who <span className="font-normal text-muted-foreground">(tap more than one if needed; each gets their own copy)</span></Label>
            {people.length === 0 && <p className="text-sm text-muted-foreground">Loading staff…</p>}
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={personKeys.includes(p.key)}
                  className={chip(personKeys.includes(p.key))}
                  onClick={() => setPickedKeys(personKeys.includes(p.key) ? personKeys.filter((k) => k !== p.key) : [...personKeys, p.key])}
                >
                  {p.name}
                  {p.roles.length > 0 && <span className="ml-1 text-xs opacity-70">· {p.roles.join(', ')}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Order (optional)</Label>
            {order ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{order.label}</span>
                {!fixedOrder && (
                  <button type="button" onClick={() => setPickedOrder(null)} aria-label="Remove order" className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <OrderSearch onOrderSelect={(o) => setPickedOrder({
                id: o.id,
                label: `#${o.id.slice(0, 7).toUpperCase()}${o.customers?.full_name ? ` · ${o.customers.full_name}` : ''}`,
              })} />
            )}
            {shipContext && (
              <ShipContextBlock hold={shipContext.hold} others={shipContext.others} self={shipContext} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-message">Task</Label>
            {order && (
              <div className="flex flex-wrap gap-2">
                {ORDER_QUICK_TEXT.map((t) => (
                  <button key={t} type="button" className={chip(message === t)} onClick={() => setMessage(t)}>{t}</button>
                ))}
              </div>
            )}
            <Textarea
              id="task-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={onlyMe ? 'e.g. Ask the supplier when the egg pan is back' : 'e.g. Jas, this one can ship now'}
            />
            {warnings.length > 0 && (
              <div role="alert" className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Check before sending: this order may not be ready to ship.</p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                  <p className="mt-1 text-xs opacity-80">You can still assign it, e.g. to collect the balance first.</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Deadline</Label>
            <div className="flex flex-wrap gap-2">
              {DUE_PICKS.map((d) => (
                <button key={d.value} type="button" className={chip(due === d.value)} onClick={() => setDue(d.value)}>{d.label}</button>
              ))}
            </div>
            {due === 'date' && (
              <Input type="date" min={phtDateString()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-48" />
            )}
            {(due === 'today' || due === 'tomorrow' || due === 'date') && (
              <p className="text-xs text-muted-foreground">By 6 PM that day.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : onlyMe ? 'Add to my tasks' : personKeys.length > 1 ? `Assign to ${personKeys.length} people` : 'Assign task'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
