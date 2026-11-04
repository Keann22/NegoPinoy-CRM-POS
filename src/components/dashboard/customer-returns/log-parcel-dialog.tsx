'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { logReturnedParcel, searchParcelOrders } from '@/hooks/useCustomerReturns';
import { CR_RETURN_REASONS, type ParcelOrderMatch } from '@/types/customer-returns.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged: () => void;
}

const phDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });

/**
 * Inventory staff: the courier brought a parcel back. Find the order by order #
 * or customer name and log it; the order's agent is then asked resend or cancel.
 */
export function LogParcelDialog({ open, onOpenChange, onLogged }: Props) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ParcelOrderMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ParcelOrderMatch | null>(null);
  const [reason, setReason] = useState('Failed delivery');
  const [boxIds, setBoxIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setResults(null); setPicked(null); setReason('Failed delivery'); setBoxIds([]); setError(null);
  }, [open]);

  // Search as they type (after 3 characters), a little after they stop.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults(null); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchParcelOrders(q)); setError(null); }
      catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const save = async () => {
    if (!picked) return;
    if (picked.boxes.length > 0 && boxIds.length === 0) return setError('Pick which box came back.');
    setSaving(true);
    setError(null);
    try {
      const out = await logReturnedParcel(picked.orderId, reason, boxIds);
      toast({
        title: out.existed ? `Return #${out.caseNo}: parcel marked as here` : `Return #${out.caseNo} logged`,
        description: 'The agent is asked: resend or cancel. Check the pieces when you open the parcel.',
      });
      onLogged();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a returned parcel</DialogTitle>
          <DialogDescription>The courier brought it back. Find the order by order # or customer name.</DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input autoFocus className="pl-8" placeholder="Order # (e.g. 3E4036B) or customer name" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {searching && <div className="flex justify-center py-2"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            {results && results.length === 0 && !searching && <p className="text-sm text-muted-foreground">No orders found.</p>}
            <div className="space-y-1.5">
              {(results || []).map((o) => (
                <button key={o.orderId} type="button" onClick={() => setPicked(o)}
                  className="w-full rounded-md border p-2 text-left hover:bg-muted/50">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-medium">{o.customerName}</span>
                    <span className="font-mono text-xs text-muted-foreground">#{o.shortId} · {phDate(o.orderDate)} · {o.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground break-words">{o.items}</p>
                  {o.openCaseNo && <p className="text-xs text-violet-700">Already has return #{o.openCaseNo}: logging marks the parcel as here.</p>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border p-2">
              <p className="font-medium">{picked.customerName} <span className="font-mono text-xs text-muted-foreground">#{picked.shortId}</span></p>
              <p className="text-xs text-muted-foreground break-words">{picked.items}</p>
              {picked.trackingNumber && <p className="text-xs text-muted-foreground">Tracking: {picked.trackingNumber}</p>}
            </div>
            {picked.boxes.length > 0 && (
              <div className="space-y-1.5">
                <Label>This order shipped as {picked.boxes.length} boxes. Which came back?</Label>
                {picked.boxes.map((b) => (
                  <label key={b.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                    <Checkbox className="mt-0.5" checked={boxIds.includes(b.id)}
                      onCheckedChange={(v) => setBoxIds((ids) => v === true ? [...ids, b.id] : ids.filter((x) => x !== b.id))} />
                    <span><span className="font-medium">{b.name}</span><span className="block text-xs text-muted-foreground break-words">{b.items}</span></span>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">Tick only the box(es) the courier brought back. The rest of the order stays delivered.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Why did it come back? (if the label says)</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {CR_RETURN_REASONS.rts.map((r) => (
                  <Button key={r} type="button" variant={reason === r ? 'default' : 'outline'} className="h-auto whitespace-normal py-2" onClick={() => setReason(r)}>{r}</Button>
                ))}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setBoxIds([]); }}>← Pick a different order</Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!picked || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Log parcel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
