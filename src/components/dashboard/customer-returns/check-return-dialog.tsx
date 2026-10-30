'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CustomerReturn, CustomerReturnAction } from '@/types/customer-returns.types';
import { ReturnPhotoPicker } from './return-photo-picker';

interface Props {
  ret: CustomerReturn | null;
  onClose: () => void;
  onSubmit: (action: CustomerReturnAction) => Promise<void>;
}

type Count = { good: string; damaged: string };

/**
 * Staff: open the parcel and count every piece Good or Damaged. Both start
 * empty on purpose, so nothing goes back on the shelf without being looked at.
 */
export function CheckReturnDialog({ ret, onClose, onSubmit }: Props) {
  const [counts, setCounts] = useState<Record<string, Count>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ret) return;
    setCounts(Object.fromEntries(ret.items.map((i) => [i.id, { good: '', damaged: '' }])));
    setPhotos([]);
    setNote('');
    setError(null);
  }, [ret]);

  if (!ret) return null;

  const set = (id: string, key: keyof Count, v: string) => setCounts((c) => ({ ...c, [id]: { ...c[id], [key]: v } }));
  const allDone = ret.items.every((i) => {
    const c = counts[i.id];
    return c && c.good !== '' && c.damaged !== '' && Number(c.good) + Number(c.damaged) === i.qty;
  });
  const anyDamaged = ret.items.some((i) => Number(counts[i.id]?.damaged) > 0);

  const submit = async () => {
    if (!allDone) return setError('Every line needs Good + Damaged to add up to the pieces in the case.');
    if (anyDamaged && photos.length === 0 && ret.photoUrls.length === 0) return setError('Add a photo of the damaged piece(s).');
    setSaving(true);
    setError(null);
    try {
      if (photos.length > 0) await onSubmit({ action: 'add_photos', id: ret.id, photoUrls: photos });
      await onSubmit({
        action: 'check', id: ret.id, note,
        items: ret.items.map((i) => ({ id: i.id, goodQty: Number(counts[i.id].good), damagedQty: Number(counts[i.id].damaged) })),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!ret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Return #{ret.caseNo}: check the pieces</DialogTitle>
          <DialogDescription>
            Open the parcel and look at every piece. Good ones go back on the shelf; damaged ones never do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {ret.items.map((i) => {
            const c = counts[i.id] || { good: '', damaged: '' };
            const sum = Number(c.good || 0) + Number(c.damaged || 0);
            const off = c.good !== '' && c.damaged !== '' && sum !== i.qty;
            return (
              <div key={i.id} className={`rounded border p-2 space-y-2 ${off ? 'border-destructive' : ''}`}>
                <p className="text-sm font-medium leading-tight break-words">{i.productName} <span className="text-muted-foreground">· {i.qty} pc(s)</span></p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-emerald-700">Good</Label>
                    <Input type="number" inputMode="numeric" min={0} max={i.qty} value={c.good} onChange={(e) => set(i.id, 'good', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-red-700">Damaged</Label>
                    <Input type="number" inputMode="numeric" min={0} max={i.qty} value={c.damaged} onChange={(e) => set(i.id, 'damaged', e.target.value)} />
                  </div>
                </div>
                {off && <p className="text-[11px] text-destructive">Adds up to {sum}, should be {i.qty}.</p>}
              </div>
            );
          })}

          {anyDamaged && (
            <div className="space-y-1.5">
              <Label>Photo of the damage</Label>
              <ReturnPhotoPicker urls={photos} onChange={setPhotos} disabled={saving} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cr-note">Note (optional)</Label>
            <Textarea id="cr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
