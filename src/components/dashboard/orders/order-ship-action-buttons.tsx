'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bus, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShipHoldDialog } from '@/components/dashboard/ship-holds/ship-hold-dialog';
import { OPEN_ORDER_STATUSES } from '@/lib/shipping/ship-hold-rules';

interface Props {
  orderId: string;
  orderStatus: string;
  onChanged?: () => void;
}

/** Quick shipping-decision buttons on the Order page: Don't ship yet / Ship by bus. */
export function OrderShipActionButtons({ orderId, orderStatus, onChanged }: Props) {
  const [holdOpen, setHoldOpen] = useState(false);

  if (!OPEN_ORDER_STATUSES.includes(orderStatus)) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setHoldOpen(true)}>
        <PauseCircle className="mr-2 h-4 w-4" /> Don&apos;t ship yet
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/dashboard/bus-shipping?mark=${encodeURIComponent(orderId)}`}>
          <Bus className="mr-2 h-4 w-4" /> Ship by bus
        </Link>
      </Button>
      <ShipHoldDialog orderId={orderId} open={holdOpen} onOpenChange={setHoldOpen} onSaved={onChanged} />
    </>
  );
}
