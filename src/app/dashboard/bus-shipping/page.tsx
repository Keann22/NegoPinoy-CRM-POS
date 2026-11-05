'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BusOrderPicker } from '@/components/dashboard/bus-shipping/bus-order-picker';
import { BusFeeForm } from '@/components/dashboard/bus-shipping/bus-fee-form';
import { BusRatesPanel } from '@/components/dashboard/bus-shipping/bus-rates-panel';
import { BusWaitingList } from '@/components/dashboard/bus-shipping/bus-waiting-list';
import { BusMarkForm } from '@/components/dashboard/bus-shipping/bus-mark-form';
import { BusSavedSummary } from '@/components/dashboard/bus-shipping/bus-saved-summary';
import { useBusQueue, useBusTrips } from '@/hooks/useBusShipping';
import {
  KNOWN_BUS_COMPANIES, type BusCandidateOrder, type BusQueueGroup, type SaveBusShipmentResult,
} from '@/types/bus-shipping.types';

const unique = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));

/**
 * Bus shipping (owner, 2026-11-05).
 * Waiting for bus: sales marks orders with the bus and station; staff see what goes.
 * Record fee: at the terminal, after paying. Bus rates: past fees and quotes.
 */
function BusShippingPage() {
  const params = useSearchParams();
  const urlOrderId = params.get('order');
  const { trips, loading: tripsLoading, reload: reloadTrips } = useBusTrips();
  const queue = useBusQueue();
  const [tab, setTab] = useState(params.get('tab') === 'rates' ? 'rates' : urlOrderId ? 'record' : 'waiting');

  // Mark for bus (sales).
  const [mark, setMark] = useState<{ key: number; orderId?: string; seed?: BusCandidateOrder[] } | null>(null);
  // Record fee (terminal).
  const [recordSeed, setRecordSeed] = useState<BusCandidateOrder[] | undefined>(undefined);
  const [recordOrderId, setRecordOrderId] = useState<string | null>(urlOrderId);
  const [orders, setOrders] = useState<BusCandidateOrder[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [saved, setSaved] = useState<{ result: SaveBusShipmentResult; orders: BusCandidateOrder[] } | null>(null);

  const companies = useMemo(
    () => unique([...queue.groups.map((g) => g.busCompany), ...trips.map((t) => t.busCompany), ...KNOWN_BUS_COMPANIES]),
    [queue.groups, trips],
  );
  const destinations = useMemo(
    () => unique([...queue.groups.map((g) => g.destination), ...trips.map((t) => t.destination)]),
    [queue.groups, trips],
  );

  const openMark = (orderId?: string, seed?: BusCandidateOrder[]) => setMark({ key: Date.now(), orderId, seed });
  const recordGroup = (g: BusQueueGroup) => {
    setSaved(null);
    setRecordOrderId(null);
    setRecordSeed(g.orders);
    setOrders(g.orders.filter((o) => o.canShip));
    setPickerKey((k) => k + 1);
    setTab('record');
  };
  const backToWaiting = () => {
    setSaved(null);
    setRecordSeed(undefined);
    setRecordOrderId(null);
    setOrders([]);
    setPickerKey((k) => k + 1);
    setTab('waiting');
  };

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="font-headline">Bus Shipping</CardTitle>
        <CardDescription>Orders going by bus, the fee we paid at the terminal, and past fees to quote customers.</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 grid w-full grid-cols-3">
            <TabsTrigger value="waiting">
              Waiting{queue.groups.length ? ` (${queue.groups.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="record">Record fee</TabsTrigger>
            <TabsTrigger value="rates">Bus rates</TabsTrigger>
          </TabsList>

          <TabsContent value="waiting">
            {mark ? (
              <BusMarkForm
                key={mark.key}
                initialOrderId={mark.orderId}
                seedOrders={mark.seed}
                companies={companies}
                destinations={destinations}
                onCancel={() => setMark(null)}
                onDone={() => { setMark(null); void queue.reload(); }}
              />
            ) : (
              <BusWaitingList
                groups={queue.groups}
                suggestions={queue.suggestions}
                loading={queue.loading}
                onMark={(orderId) => openMark(orderId)}
                onEdit={(g) => openMark(undefined, g.orders)}
                onRecord={recordGroup}
                onChanged={() => void queue.reload()}
              />
            )}
          </TabsContent>

          <TabsContent value="record" className="space-y-5">
            {saved ? (
              <BusSavedSummary result={saved.result} orders={saved.orders} onNext={backToWaiting} />
            ) : (
              <>
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">1. Which orders went on the bus?</h3>
                  <BusOrderPicker
                    key={pickerKey}
                    initialOrderId={recordSeed ? null : recordOrderId}
                    seedOrders={recordSeed}
                    selected={orders}
                    onChange={setOrders}
                  />
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
                      onSaved={(result) => { setSaved({ result, orders }); void reloadTrips(); void queue.reload(); }}
                    />
                  </section>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="rates">
            <BusRatesPanel trips={trips} loading={tripsLoading} />
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
