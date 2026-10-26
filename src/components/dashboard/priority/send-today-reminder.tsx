'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Truck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUserProfile } from '@/hooks/useUserProfile';
import { SEND_TODAY, phtDate, phtHour, reminderSlot, type PriorityRow } from '@/lib/priority/priority-rules';
import { PriorityActionDialog } from './priority-action-dialog';

const FETCH_MS = 3 * 60 * 1000;
const CLOCK_MS = 60 * 1000;

type Ack = { slot: string; ids: string[] };

function readAck(day: string): Ack | null {
  try {
    const raw = localStorage.getItem(`sendTodayAck:${day}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeAck(day: string, ack: Ack) {
  try {
    localStorage.setItem(`sendTodayAck:${day}`, JSON.stringify(ack));
  } catch {
    // Private mode / blocked storage: the reminder just shows again next time.
  }
}

/**
 * Warehouse reminder for orders marked "send today". Pops when the dashboard
 * opens and again at each reminder time (11:30, 12:30, 1:15, 1:45), and right
 * away when a new order is marked. It can't be clicked away: "Working on it"
 * hides it until the next reminder, and "Can't send today" sends an order back
 * to sales with a reason. An order leaves once it is booked (For Pick-up).
 */
export function SendTodayReminder() {
  const { userProfile } = useUserProfile();
  const roles = (userProfile?.roles || []).map((r) => String(r).toLowerCase());
  const isWarehouse = roles.some((r) => ['inventory', 'admin', 'owner'].includes(r));

  const [rows, setRows] = useState<PriorityRow[]>([]);
  const [open, setOpen] = useState(false);
  const [blockRow, setBlockRow] = useState<PriorityRow | null>(null);
  const [now, setNow] = useState(() => new Date());
  const rowsRef = useRef<PriorityRow[]>([]);

  const evaluate = useCallback((list: PriorityRow[], at: Date) => {
    if (list.length === 0) return setOpen(false);
    const ack = readAck(phtDate(at));
    const slot = reminderSlot(at);
    const hasNew = list.some((r) => !ack?.ids.includes(r.id));
    if (!ack || ack.slot !== slot || hasNew) setOpen(true);
  }, []);

  const fetchRows = useCallback(async () => {
    // Safety net for "now fully paid" notices (payments entered outside Log Payment / Edit Order).
    // Live app only: a local dev server talks to the live database and would notify real staff.
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/priority/paid-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }
    try {
      const res = await fetch('/api/priority/send-today', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      rowsRef.current = data.rows || [];
      setRows(rowsRef.current);
      evaluate(rowsRef.current, new Date());
    } catch {
      // Offline or server hiccup: try again on the next tick.
    }
  }, [evaluate]);

  useEffect(() => {
    if (!isWarehouse) return;
    fetchRows();
    const fetchTimer = setInterval(fetchRows, FETCH_MS);
    const clockTimer = setInterval(() => {
      const at = new Date();
      setNow(at);
      evaluate(rowsRef.current, at);
    }, CLOCK_MS);
    return () => {
      clearInterval(fetchTimer);
      clearInterval(clockTimer);
    };
  }, [isWarehouse, fetchRows, evaluate]);

  const acknowledge = () => {
    writeAck(phtDate(now), { slot: reminderSlot(now), ids: rows.map((r) => r.id) });
    setOpen(false);
  };

  const notPacked = useMemo(() => rows.filter((r) => r.step === 'send_today'), [rows]);
  const waitingUpload = useMemo(() => rows.filter((r) => r.step === 'send_upload'), [rows]);

  if (!isWarehouse) return null;

  const pastPickup = phtHour(now) >= SEND_TODAY.pickupHour;
  const isFinal = !pastPickup && reminderSlot(now) === SEND_TODAY.finalReminder;
  const urgent = isFinal || pastPickup;
  const title = pastPickup
    ? `Missed today's pickup — ${rows.length} not booked`
    : isFinal
      ? `Pickup at 2 PM — book these now (${rows.length})`
      : `Send today — ${rows.length} order${rows.length === 1 ? '' : 's'} to book before 2 PM`;

  const renderRow = (r: PriorityRow) => (
    <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 border-b py-2 last:border-0">
      <div className="min-w-0 text-sm">
        <Link href={`/dashboard/orders/${r.id}`} className="font-semibold hover:underline" onClick={acknowledge}>
          #{r.id.slice(0, 7).toUpperCase()}
        </Link>{' '}
        {r.customerName || 'Customer'} <span className="text-muted-foreground">· {r.salesPersonName || '—'} · {r.status}</span>
        {r.sendToday?.note && <div className="text-xs text-muted-foreground">“{r.sendToday.note}”</div>}
        {r.missing.length > 0 && (
          <div className="text-xs text-red-700 dark:text-red-300">Missing: {r.missing.map((m) => `${m.qty}× ${m.name}`).join(', ')}</div>
        )}
      </div>
      <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => { setOpen(false); setBlockRow(r); }}>
        <Ban className="mr-1.5 h-4 w-4" />Can&apos;t send today
      </Button>
    </li>
  );

  return (
    <>
      <Dialog open={open && !blockRow} onOpenChange={() => { /* only the buttons close it */ }}>
        <DialogContent
          className={cn('max-h-[85vh] overflow-y-auto sm:max-w-lg [&>button]:hidden', urgent && 'border-2 border-red-500')}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className={cn('flex items-center gap-2', urgent && 'text-red-600 dark:text-red-400')}>
              <Truck className="h-5 w-5" />{title}
            </DialogTitle>
            <DialogDescription>
              Pick, pack and book each one. If one can&apos;t go out today, tap &quot;Can&apos;t send today&quot; so sales can tell the customer.
            </DialogDescription>
          </DialogHeader>

          {notPacked.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Not packed yet ({notPacked.length})</h3>
              <ul>{notPacked.map(renderRow)}</ul>
            </section>
          )}
          {waitingUpload.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Packed — waiting for SPX upload ({waitingUpload.length})</h3>
              <p className="text-xs text-muted-foreground">Book these with SPX and upload the Excel so they move to For Pick-up.</p>
              <ul>{waitingUpload.map(renderRow)}</ul>
            </section>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" asChild onClick={acknowledge}>
              <Link href="/dashboard/priority">Open Priority List</Link>
            </Button>
            <Button onClick={acknowledge} variant={urgent ? 'destructive' : 'default'}>Working on it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PriorityActionDialog
        row={blockRow}
        action={blockRow ? 'block' : null}
        onClose={() => { setBlockRow(null); evaluate(rowsRef.current, new Date()); }}
        onSaved={fetchRows}
      />
    </>
  );
}
