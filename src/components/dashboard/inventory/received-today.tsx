'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, ChevronDown, ChevronRight, History, Loader2, Lock, Pencil, Undo2 } from 'lucide-react';

type Receipt = {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  at: string;
  kind: 'purchase' | 'unexpected';
  shortNote: string | null;
  warehouseName: string | null;
  receivedBy: string | null;
  confirmed: boolean;
  stockLevel: number;
  canEdit: boolean;
  lockReason: string | null;
  corrections: { at: string; text: string }[];
};

type Undone = { id: string; productName: string; at: string; text: string };

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });

const todayPht = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

/**
 * Receipts made from Pending Incoming Items, with an Edit button to fix a
 * miscount. Staff can edit their own receipts the same day until an admin has
 * checked them; Owner/Admin can edit any (and pick another day).
 */
export function ReceivedToday({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(todayPht());
  const [isManagement, setIsManagement] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [undone, setUndone] = useState<Undone[]>([]);
  const [editing, setEditing] = useState<Receipt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/receive/receipts?day=${day}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load receipts.');
      setIsManagement(!!data.isManagement);
      setReceipts(data.receipts || []);
      setUndone(data.undone || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const isToday = day === todayPht();
  const total = receipts.reduce((sum, r) => sum + r.qty, 0);

  return (
    <Card className="mb-6 border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <button type="button" onClick={() => setOpen(o => !o)} className="flex items-start gap-2 text-left">
            {open ? <ChevronDown className="w-5 h-5 mt-0.5 text-slate-500" /> : <ChevronRight className="w-5 h-5 mt-0.5 text-slate-500" />}
            <div>
              <CardTitle className="text-lg">
                {isToday ? 'Received today' : 'Received'}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'} · {total.toLocaleString()} pcs
                </span>
              </CardTitle>
              <CardDescription>
                Counted wrong? Press Edit to fix the quantity, or Undo if it was received against the wrong item.
              </CardDescription>
            </div>
          </button>
          {isManagement && (
            <Input
              type="date"
              value={day}
              max={todayPht()}
              onChange={e => e.target.value && setDay(e.target.value)}
              className="w-[160px] h-8 text-sm self-start sm:self-auto"
            />
          )}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : receipts.length === 0 && undone.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nothing received {isToday ? 'yet today' : 'on this day'}.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 border-y">
                  <tr>
                    <th className="p-3 text-left font-medium">Time</th>
                    <th className="p-3 text-left font-medium">Product</th>
                    <th className="p-3 text-right font-medium">Qty</th>
                    <th className="p-3 text-left font-medium hidden md:table-cell">Into</th>
                    <th className="p-3 text-left font-medium hidden md:table-cell">By</th>
                    <th className="p-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {receipts.map(r => (
                    <tr key={r.id} className="align-top hover:bg-slate-50">
                      <td className="p-3 whitespace-nowrap text-slate-500">{time(r.at)}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{r.productName}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.kind === 'unexpected' && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Unexpected item</Badge>}
                          {r.confirmed && <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">Checked by admin</Badge>}
                          {r.shortNote && <Badge variant="outline" className="text-[10px] border-red-200 text-red-700" title={r.shortNote}>Short delivery</Badge>}
                        </div>
                        {r.corrections.map((c, i) => (
                          <div key={i} className="mt-1 text-xs text-blue-700 flex items-start gap-1">
                            <History className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{time(c.at)} · {c.text}</span>
                          </div>
                        ))}
                        <div className="md:hidden text-xs text-muted-foreground mt-1">
                          {r.warehouseName}{r.receivedBy ? ` · ${r.receivedBy}` : ''}
                        </div>
                      </td>
                      <td className="p-3 text-right font-semibold tabular-nums">{r.qty}</td>
                      <td className="p-3 hidden md:table-cell text-slate-600">{r.warehouseName || '—'}</td>
                      <td className="p-3 hidden md:table-cell text-slate-600">{r.receivedBy || '—'}</td>
                      <td className="p-3 text-right">
                        {r.canEdit ? (
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(r)}>
                            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>
                        ) : (
                          <span title={r.lockReason || ''} className="inline-flex items-center text-slate-400">
                            <Lock className="w-4 h-4" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {undone.map(u => (
                    <tr key={u.id} className="bg-slate-50/60 text-slate-500">
                      <td className="p-3 whitespace-nowrap">{time(u.at)}</td>
                      <td className="p-3" colSpan={5}>
                        <span className="font-medium line-through">{u.productName}</span>
                        <div className="text-xs mt-0.5 flex items-start gap-1"><Undo2 className="w-3 h-3 mt-0.5 shrink-0" />{u.text}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}

      <EditReceiptDialog
        receipt={editing}
        onClose={() => setEditing(null)}
        onSaved={(msg) => {
          setEditing(null);
          toast({ title: 'Receipt updated', description: msg });
          load();
          onChanged?.();
        }}
      />
    </Card>
  );
}

function EditReceiptDialog({
  receipt,
  onClose,
  onSaved,
}: {
  receipt: Receipt | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { toast } = useToast();
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (receipt) {
      setQty(String(receipt.qty));
      setNote('');
    }
  }, [receipt]);

  if (!receipt) return null;

  const newQty = qty === '' ? NaN : Number(qty);
  const valid = Number.isInteger(newQty) && newQty >= 0 && newQty !== receipt.qty;
  const delta = valid ? newQty - receipt.qty : 0;
  const stockAfter = receipt.stockLevel + delta;
  const goesNegative = valid && delta < 0 && stockAfter < 0;

  const save = async (target: number) => {
    if (!note.trim()) {
      toast({ variant: 'destructive', title: 'Add a short note', description: 'Say what was wrong, e.g. "counted 10, only 1 box".' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/receive/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movementId: receipt.id, newQty: target, note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      const parts = [
        target === 0
          ? `${receipt.productName}: receipt undone (${receipt.qty} pcs taken back out).`
          : `${receipt.productName}: ${receipt.qty} → ${target} pcs.`,
      ];
      if (data.reopenedRemaining > 0) parts.push(`${data.reopenedRemaining} back on Pending Incoming Items.`);
      onSaved(parts.join(' '));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not update receipt', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!receipt} onOpenChange={o => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Edit receipt</DialogTitle>
          <DialogDescription>
            {receipt.productName} — received {receipt.qty} pcs at {time(receipt.at)}
            {receipt.warehouseName ? ` into ${receipt.warehouseName}` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="receipt-qty">Quantity that actually arrived</label>
            <Input
              id="receipt-qty"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={qty}
              onChange={e => setQty(e.target.value)}
              className="mt-1"
            />
            {valid && (
              <p className="mt-1 text-xs text-muted-foreground">
                {delta < 0 ? `Takes ${-delta} back out of stock.` : `Adds ${delta} more to stock.`}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="receipt-note">What was wrong?</label>
            <Input
              id="receipt-note"
              placeholder='e.g. "typed 10, only 1 box arrived"'
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={300}
              className="mt-1"
            />
          </div>

          {goesNegative && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Stock will go to {stockAfter}: some orders were counting on these units. They will show as waiting
                again and the item goes back on Need to Buy.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50"
            disabled={saving}
            onClick={() => {
              if (confirm(`Undo this receipt? ${receipt.qty} pcs of ${receipt.productName} will be taken back out of stock.`)) save(0);
            }}
          >
            <Undo2 className="w-4 h-4 mr-1" /> Undo receipt
          </Button>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={() => save(newQty)} disabled={!valid || saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
