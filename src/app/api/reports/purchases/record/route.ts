import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { repairFromPurchaseItem } from '@/lib/services/purchase-repair-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Records the missing supplier and/or cost for one received item straight from
 * the Purchases Report warning banner. See purchase-repair-service for what the
 * repair actually touches.
 */
export async function POST(req: Request) {
  try {
    const { itemId, supplierId, unitCost, receivedQty, receivedAt } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    const itemIds = itemId.split(',');

    // A quantity correction is reason enough to save on its own - a mis-keyed
    // receipt needs fixing whether or not anyone knows the price yet.
    const qty = receivedQty === null || receivedQty === undefined || receivedQty === ''
      ? null
      : Number(receivedQty);
    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
      return NextResponse.json({ error: 'Received quantity must be zero or more.' }, { status: 400 });
    }
    if (!supplierId && !(Number(unitCost) > 0) && qty === null) {
      return NextResponse.json({ error: 'Pick a supplier, enter a unit cost, or correct the received quantity.' }, { status: 400 });
    }

    // A date-only value ("2026-07-18") would land at UTC midnight, i.e. 8am PHT
    // the same day - fine for grouping the report by buying day, which is all
    // this date is used for.
    let receiptIso: string | null = null;
    if (receivedAt) {
      const parsed = new Date(receivedAt);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Received date is not a valid date.' }, { status: 400 });
      }
      receiptIso = parsed.toISOString();
    }

    let totalCurrentQty = 0;
    const items = [];
    for (const id of itemIds) {
      const { data, error } = await supabase.from('purchase_order_items').select('received_qty').eq('id', id).single();
      if (error) throw error;
      const q = Number(data.received_qty) || 0;
      totalCurrentQty += q;
      items.push({ id, currentQty: q });
    }

    const delta = qty !== null ? qty - totalCurrentQty : 0;
    
    let combinedResult = {
      linesUpdated: 0,
      cogsAdded: 0,
      movementUpdated: false,
      supplierName: null as string | null,
      qtyDelta: delta,
      expectedWas: null as number | null,
      expectedNow: null as number | null,
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Apply the entire delta to the first item, others just keep their current qty
      const targetQty = i === 0 ? item.currentQty + delta : item.currentQty;
      
      const result = await repairFromPurchaseItem(
        supabase,
        item.id,
        supplierId || null,
        Number(unitCost) || null,
        targetQty,
        receiptIso,
      );
      
      combinedResult.linesUpdated += result.linesUpdated;
      combinedResult.cogsAdded += result.cogsAdded;
      combinedResult.movementUpdated = combinedResult.movementUpdated || result.movementUpdated;
      combinedResult.supplierName = result.supplierName;
      if (i === 0) {
        combinedResult.expectedWas = result.expectedWas;
        combinedResult.expectedNow = result.expectedNow;
      }
    }

    return NextResponse.json({ success: true, ...combinedResult });
  } catch (error: any) {
    console.error('Error recording purchase detail:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
