'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BusOrderPicker } from '@/components/dashboard/bus-shipping/bus-order-picker';
import { BusFeeForm } from '@/components/dashboard/bus-shipping/bus-fee-form';
import { BusRatesPanel } from '@/components/dashboard/bus-shipping/bus-rates-panel';
import { useBusTrips } from '@/hooks/useBusShipping';
import type { BusCandidateOrder, SaveBusShipmentResult } from '@/types/bus-shipping.types';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Bus shipping (owner, 2026-11-05). Staff record what they paid the bus company,
 * on the phone at the terminal; Bus Rates shows past fees and quotes.
 */
function BusShippingPage() {
  const params = useSearchParams();
  const initialOrderId = params.get('order');
  const { trips, loading, reload } = useBusTrips();
  const [tab, setTab] = useState(params.get('tab') === 'rates' ? 'rates' : 'record');
  const [orders, setOrders] = useState<BusCandidateOrder[]>([]);
  const [saved, setSaved] = useState<{ result: SaveBusShipmentResult; orders: BusCandidateOrder[] } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  const startOver = () => {
    setSaved(null);
    setOrders([]);
    setPickerKey((k) => k + 1);
  };

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="font-headline">Bus Shipping</CardTitle>
        <CardDescription>Record what we paid the bus company, and check past fees to quote customers.</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="record">Record bus fee</TabsTrigger>
            <TabsTrigger value="rates">Bus rates</TabsTrigger>
          </TabsList>

          <TabsContent value="record" className="space-y-5">
            {saved ? (
              <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
                <p className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" /> Saved. {saved.orders.length} order{saved.orders.length === 1 ? '' : 's'} marked Shipped.
                </p>
                <p>Tracking: {saved.result.trackingText}</p>
                {saved.result.creditUsed > 0 && <p>{peso(saved.result.creditUsed)} of their store credit (the SF they sent) was used for the fee.</p>}
                {saved.result.owed > 0.009 && <p className="font-semibold">Customer still owes {peso(saved.result.owed)} SF. The sales agent was asked to collect it.</p>}
                {saved.result.extra > 0.009 && <p className="font-semibold">Customer sent {peso(saved.result.extra)} extra. The sales agent will decide what to do with it.</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {saved.orders.map((o) => (
                    <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="font-mono text-primary hover:underline">#{o.shortId}</Link>
                  ))}
                </div>
                <Button onClick={startOver} className="w-full">Record another bus trip</Button>
              </div>
            ) : (
              <>
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">1. Which orders went on the bus?</h3>
                  <BusOrderPicker key={pickerKey} initialOrderId={initialOrderId} selected={orders} onChange={setOrders} />
                </section>
                {orders.length > 0 && (
                  <section className="space-y-2 border-t pt-4">
                    <h3 className="text-sm font-semibold">
                      2. What did we pay? ({orders.map((o) => `#${o.shortId}`).join(', ')})
                    </h3>
                    <BusFeeForm
                      key={orders.map((o) => o.id).join(',')}
                      orders={orders}
                      trips={trips}
                      onSaved={(result) => { setSaved({ result, orders }); reload(); }}
                    />
                  </section>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="rates">
            <BusRatesPanel trips={trips} loading={loading} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BusShippingPage />
    </Suspense>
  );
}
