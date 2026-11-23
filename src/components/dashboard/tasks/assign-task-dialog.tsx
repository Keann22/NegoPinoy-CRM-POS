'use client';

import { useState } from 'react';
import { ClipboardCheck, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { createStaffTask, useTaskPeople } from '@/hooks/useStaffTasks';
import { OrderSearch } from '@/components/dashboard/order-search';
import { dueFromPick, phtDateString, type DuePick } from '@/lib/services/staff-tasks/task-dates';
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
const ORDER_QUICK_TEXT = ['Pwede na ipadala', 'Paki-pick at i-book', 'Paki-check ang order'];

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
}

/** Owners give a staff member a task, optionally about an order, with an optional deadline. */
export function AssignTaskDialog({ open, onOpenChange, order: fixedOrder, onCreated }: Props) {
  const { toast } = useToast();
  const people = useTaskPeople(open);
  const [personKeys, setPersonKeys] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [pickedOrder, setPickedOrder] = useState<TaskOrderRef | null>(null);
  const [due, setDue] = useState<DuePick>('none');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const order = fixedOrder || pickedOrder;
  const canSave = personKeys.length > 0 && message.trim().length > 0 && (due !== 'date' || !!dueDate);

  const close = (next: boolean) => {
    if (!next) {
      setPersonKeys([]); setMessage(''); setPickedOrder(null); setDue('none'); setDueDate('');
    }
    onOpenChange(next);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createStaffTask({ personKeys, message: message.trim(), orderId: order?.id || null, dueAt: dueFromPick(due, dueDate) });
      const who = people.filter((p) => personKeys.includes(p.key)).map((p) => p.name).join(', ') || 'Staff';
      toast({ title: `Task sent to ${who}`, description: 'They get a pop-up. You get a bell when it\'s done.' });
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
          <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Assign a task</DialogTitle>
          <DialogDescription>They get a pop-up, then it stays on their dashboard until they tap Done.</DialogDescription>
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
                  onClick={() => setPersonKeys((ks) => (ks.includes(p.key) ? ks.filter((k) => k !== p.key) : [...ks, p.key]))}
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
              placeholder="e.g. Jas, pwede na yang ipadala"
            />
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
          <Button onClick={save} disabled={!canSave || saving}>{saving ? 'Sending…' : personKeys.length > 1 ? `Assign to ${personKeys.length} people` : 'Assign task'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
