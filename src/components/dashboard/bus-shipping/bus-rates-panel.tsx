'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { estimateBusFees } from '@/lib/services/shipping/bus-fee-rules';
import type { BusTrip } from '@/types/bus-shipping.types';
import { SuggestionChips } from './suggestion-chips';

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;
const phDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));

/**
 * Price history per bus company and destination, and a quote for the customer
 * before shipping: pick where it's going, enter weight and value, see each
 * company's likely fee, cheapest first.
 */
export function BusRatesPanel({ trips, loading }: { trips: BusTrip[]; loading: boolean }) {
  const [destination, setDestination] = useState('');
  const [weight, setWeight] = useState('');
  const [value, setValue] = useState('');

  const destinations = useMemo(() => Array.from(new Set(trips.map((t) => t.destination))), [trips]);
  const estimates = useMemo(
    () => estimateBusFees(trips, destination, toNum(weight), toNum(value)),
    [trips, destination, weight, value],
  );
  const shownTrips = useMemo(() => {
    const d = destination.trim().toLowerCase();
    return (d ? trips.filter((t) => t.destination.toLowerCase().includes(d)) : trips).slice(0, 50);
  }, [trips, destination]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading bus trips…</p>;
  if (trips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No bus fees recorded yet. Each fee staff record after paying at the terminal shows up here, so quotes get better over time.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-semibold">Quote a customer</p>
        <div className="space-y-1">
          <Label>Going to</Label>
          <Input className="h-11 text-base" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Terminal / town" />
          <SuggestionChips options={destinations} value={destination} onPick={setDestination} max={10} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Weight (kg)</Label>
            <Input className="h-11 text-base" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Item value (₱)</Label>
            <Input className="h-11 text-base" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>
        {destination.trim() && estimates.length === 0 && (
          <p className="text-sm text-muted-foreground">No trips to “{destination.trim()}” yet. Pick one of the places above.</p>
        )}
        {estimates.length > 0 && (
          <ul className="space-y-2">
            {estimates.map((e, i) => (
              <li key={e.busCompany} className="rounded-md border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{e.busCompany}</span>
                  {i === 0 && estimates.length > 1 && <Badge className="bg-emerald-600">Cheapest</Badge>}
                  <span className="ml-auto text-base font-semibold">{e.estimate != null ? `≈ ${peso(e.estimate)}` : '—'}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {e.basis}. Last {peso(e.lastFee)} on {phDate(e.lastDate)}
                  {e.trips > 1 ? `; ${peso(e.minFee)}–${peso(e.maxFee)}` : ''}.
                </p>
              </li>
            ))}
            <li className="text-xs text-muted-foreground">An estimate from past trips; the bus company sets the real fee.</li>
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{destination.trim() ? 'Trips to this place' : 'Recent trips'}</p>
        <ul className="divide-y rounded-md border">
          {shownTrips.map((t) => (
            <li key={t.id} className="space-y-0.5 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{t.busCompany}</span>
                <span className="text-muted-foreground">→ {t.destination}</span>
                <span className="ml-auto font-semibold">{peso(t.fee)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {phDate(t.shippedAt)}
                {t.weightKg ? ` · ${t.weightKg} kg` : ''}
                {t.declaredValue ? ` · value ${peso(t.declaredValue)}` : ''}
                {t.boxCount ? ` · ${t.boxCount} box${t.boxCount === 1 ? '' : 'es'}` : ''}
                {t.customerName ? ` · ${t.customerName}` : ''}
                {t.orderIds.map((id) => (
                  <Link key={id} href={`/dashboard/orders/${id}`} className="ml-1 font-mono text-primary hover:underline">
                    #{id.slice(0, 7).toUpperCase()}
                  </Link>
                ))}
                {t.receiptUrl && (
                  <a href={t.receiptUrl} target="_blank" rel="noreferrer" className="ml-2 text-primary hover:underline">receipt</a>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
