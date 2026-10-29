'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, ClipboardList, Receipt } from 'lucide-react';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { PendingPurchases } from '@/components/dashboard/pending-purchases';
import { TodaysPurchasesDialog } from '@/components/dashboard/procurement/todays-purchases-dialog';
import { ReceivedToday } from '@/components/dashboard/inventory/received-today';
import { ReceiptLinesToMatch } from '@/components/dashboard/inventory/receipt-lines-to-match';

// Where staff count and record what arrived. Stock only comes in against a
// recorded purchase (Pending Incoming Items); the old free-form Bulk Receive
// form was removed because it let stock in with no purchase behind it.
export default function ReceivingPage() {
  const { isManagement } = useRoleCheck();
  const [todaysPurchasesOpen, setTodaysPurchasesOpen] = useState(false);
  // Receiving adds to "Received today"; correcting a receipt there can put a
  // line back on Pending Incoming Items. Each bump refreshes the other list.
  const [receivedTick, setReceivedTick] = useState(0);
  const [pendingTick, setPendingTick] = useState(0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-headline">Receiving</h1>
        {isManagement ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild className="font-bold flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700">
              <Link href="/dashboard/inventory/snap-receipt">
                <Camera className="w-4 h-4" />
                Snap receipt
              </Link>
            </Button>
            <Button asChild variant="outline" className="font-bold flex items-center gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              <Link href="/dashboard/inventory/purchases-receipts">
                <Receipt className="w-4 h-4 text-emerald-600" />
                Purchases &amp; Receipts
              </Link>
            </Button>
          </div>
        ) : (
          // Staff get the same summary without suppliers or costs.
          <Button
            type="button"
            variant="outline"
            onClick={() => setTodaysPurchasesOpen(true)}
            className="font-bold flex items-center gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            <ClipboardList className="w-4 h-4 text-emerald-600" />
            Today&apos;s Purchases &amp; Received
          </Button>
        )}
      </div>
      <TodaysPurchasesDialog
        open={todaysPurchasesOpen}
        onOpenChange={setTodaysPurchasesOpen}
        onChanged={() => {}}
      />

      {/* Snapped receipt lines the system wasn't sure about; matching one records it. */}
      <ReceiptLinesToMatch onMatched={() => setPendingTick(t => t + 1)} refreshKey={pendingTick} />

      <PendingPurchases onReceiveComplete={() => setReceivedTick(t => t + 1)} refreshKey={pendingTick} />

      <ReceivedToday refreshKey={receivedTick} onChanged={() => setPendingTick(t => t + 1)} />
    </div>
  );
}
