import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/services/payments/payment-discrepancy-service';
import { TransferError, ordersForTransfer, saveTransfer } from '@/lib/services/payments/gcash-transfer-service';
import type { SaveTransferInput } from '@/types/gcash-transfer.types';

export const runtime = 'nodejs';

function fail(err: unknown) {
  if (err instanceof TransferError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('GCash transfer error:', err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
}

/** GET ?orderId=… : the orders one GCash can pay (that order first, then the customer's others that owe). */
export async function GET(request: Request) {
  try {
    const orderId = new URL(request.url).searchParams.get('orderId');
    if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    return NextResponse.json({ orders: await ordersForTransfer(serviceClient(), orderId) });
  } catch (err) {
    return fail(err);
  }
}

/** POST: save one GCash transfer across several orders of the same customer. */
export async function POST(request: Request) {
  try {
    const input = (await request.json()) as SaveTransferInput;
    return NextResponse.json(await saveTransfer(serviceClient(), input));
  } catch (err) {
    return fail(err);
  }
}
