'use client';

import { useMemo, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { saveBusShipment, uploadBusReceipt } from '@/hooks/useBusShipping';
import { busSfResult, defaultShares, estimateBusFees, round2 } from '@/lib/services/shipping/bus-fee-rules';
import { KNOWN_BUS_COMPANIES, type BusCandidateOrder, type BusTrip, type SaveBusShipmentResult } from '@/types/bus-shipping.types';
import { BusFeeShares } from './bus-fee-shares';
import { SuggestionChips } from './suggestion-chips';

const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));
const unique = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));

interface Props {
  orders: BusCandidateOrder[];
  trips: BusTrip[];
  onSaved: (result: SaveBusShipmentResult) => void;
}

/** What we paid the bus company for these orders. */
export function BusFeeForm({ orders, trips, onSaved }: Props) {
  const { toast } = useToast();
  // From what sales marked (Waiting for bus), when there is one.
  const plan = orders.find((o) => o.busPlan)?.busPlan;
  const [company, setCompany] = useState(plan?.busCompany || '');
  const [destination, setDestination] = useState(plan?.destination || '');
  // Filled from the orders (the page remounts this form when the ticked orders change).
  const [weight, setWeight] = useState(() => {
    const kg = orders.every((o) => o.weightKg) ? round2(orders.reduce((s, o) => s + (o.weightKg || 0), 0)) : null;
    return kg ? String(kg) : '';
  });
  const [value, setValue] = useState(() => String(round2(orders.reduce((s, o) => s + o.itemValue, 0))));
  const [boxes, setBoxes] = useState(() => {
    const box = orders.every((o) => o.boxCount) ? orders.reduce((s, o) => s + (o.boxCount || 0), 0) : null;
    return box ? String(box) : '';
  });
  const [fee, setFee] = useState('');
  const [freeShipping, setFreeShipping] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Shares staff typed; until then the default split follows the fee. */
  const [editedShares, setEditedShares] = useState<Record<string, string> | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const feeNum = toNum(fee) || 0;
  const shares = editedShares
    ?? Object.fromEntries(defaultShares(orders, feeNum).map((s) => [s.orderId, String(s.amount)]));

  const shareList = orders.map((o) => ({ orderId: o.id, amount: Number(shares[o.id]) || 0 }));
  // Store credit isn't known here; the server takes back what it can.
  const result = busSfResult(orders, shareList, Infinity, freeShipping);

  const companies = useMemo(() => unique([...trips.map((t) => t.busCompany), ...KNOWN_BUS_COMPANIES]), [trips]);
  const destinations = useMemo(() => {
    const c = company.trim().toLowerCase();
    return unique([
      ...trips.filter((t) => t.busCompany.toLowerCase() === c).map((t) => t.destination),
      ...trips.map((t) => t.destination),
    ]);
  }, [trips, company]);
  const hint = useMemo(() => {
    const est = estimateBusFees(trips, destination, toNum(weight), toNum(value))
      .find((e) => e.busCompany.toLowerCase() === company.trim().toLowerCase());
    return est?.estimate ? `Usually about ₱${est.estimate.toLocaleString('en-PH')} (${est.basis}).` : null;
  }, [trips, destination, weight, value, company]);

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setReceiptUrl(await uploadBusReceipt(file));
    } catch (e) {
      toast({ title: 'Photo not added', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveBusShipment({
        busCompany: company, destination, fee: feeNum,
        weightKg: toNum(weight), declaredValue: toNum(value), boxCount: toNum(boxes),
        receiptUrl, freeShipping, shares: shareList,
      });
      toast({ title: 'Bus fee saved', description: `${orders.length} order${orders.length === 1 ? '' : 's'} marked Shipped.` });
      onSaved(saved);
    } catch (e) {
      toast({ title: 'Not saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const sharesOff = Math.abs(shareList.reduce((s, x) => s + x.amount, 0) - feeNum) > 0.01;
  const canSave = orders.length > 0 && company.trim() && destination.trim() && feeNum > 0 && !sharesOff && !uploading;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Bus company</Label>
        <Input className="h-11 text-base" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Victory Liner" />
        <SuggestionChips options={companies} value={company} onPick={setCompany} />
      </div>
      <div className="space-y-1">
        <Label>Going to (terminal / town)</Label>
        <Input className="h-11 text-base" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Binalonan, Pangasinan" />
        <SuggestionChips options={destinations} value={destination} onPick={setDestination} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label>Weight (kg)</Label>
          <Input className="h-11 text-base" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Item value</Label>
          <Input className="h-11 text-base" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Boxes</Label>
          <Input className="h-11 text-base" inputMode="numeric" value={boxes} onChange={(e) => setBoxes(e.target.value)} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Weight and value as written on the bus receipt (the bus charges by both).</p>
      <div className="space-y-1">
        <Label>Fee we paid the bus (₱)</Label>
        <Input className="h-12 text-lg font-semibold" inputMode="decimal" value={fee} onChange={(e) => { setFee(e.target.value); setEditedShares(null); }} placeholder="0" />
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={freeShipping} onCheckedChange={(c) => setFreeShipping(c === true)} />
        Free shipping (we pay; don’t charge the customer)
      </label>

      <div className="flex items-center gap-3">
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addPhoto(e.target.files?.[0])} />
        <Button type="button" variant="outline" onClick={() => photoRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          {receiptUrl ? 'Change receipt photo' : 'Photo of bus receipt (optional)'}
        </Button>
        {receiptUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- small preview of the uploaded photo
          <img src={receiptUrl} alt="Bus receipt" className="h-12 w-12 rounded object-cover" />
        )}
      </div>

      <BusFeeShares
        orders={orders}
        shares={shares}
        onShareChange={(id, v) => setEditedShares({ ...shares, [id]: v })}
        fee={feeNum}
        freeShipping={freeShipping}
        result={result}
      />

      <Button className="h-12 w-full text-base" disabled={!canSave || saving} onClick={save}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save fee and mark {orders.length} order{orders.length === 1 ? '' : 's'} Shipped
      </Button>
    </div>
  );
}
