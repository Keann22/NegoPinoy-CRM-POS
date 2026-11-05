'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { markForBus } from '@/hooks/useBusShipping';
import type { BusCandidateOrder } from '@/types/bus-shipping.types';
import { BusOrderPicker } from './bus-order-picker';
import { SuggestionChips } from './suggestion-chips';

interface Props {
  /** Start from this order: its customer's orders are listed and it is ticked. */
  initialOrderId?: string | null;
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
export function BusMarkForm({ initialOrderId, seedOrders, companies, destinations, onDone, onCancel }: Props) {
  const { toast } = useToast();
  const plan = seedOrders?.find((o) => o.busPlan)?.busPlan;
  const [orders, setOrders] = useState<BusCandidateOrder[]>(seedOrders || []);
  const [company, setCompany] = useState(plan?.busCompany || '');
  const [destination, setDestination] = useState(plan?.destination || '');
  const [note, setNote] = useState(plan?.note || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await markForBus({ orderIds: orders.map((o) => o.id), busCompany: company, destination, note });
      toast({ title: 'Marked for bus', description: `${orders.length} order${orders.length === 1 ? '' : 's'} of ${orders[0].customerName}` });
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
