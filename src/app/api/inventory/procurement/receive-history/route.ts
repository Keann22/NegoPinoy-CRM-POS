import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Receipts booked by /api/inventory/receive/pending-pos against a PO line. Those
// are represented by the purchase_order_items rows below, so the matching ledger
// movements are skipped to avoid listing the same stock twice.
const PO_RECEIPT_REASONS = ['received from po', 'discrepancy reported'];

function describeDirectReceipt(movementType: string, reason: string): string {
  const r = reason.toLowerCase();
  if (movementType.toLowerCase() === 'initial_stock') return 'Initial stock';
  if (r.startsWith('unexpected delivery')) return 'Unexpected delivery (not on any purchase)';
  if (r.startsWith('bulk receive')) return 'Bulk receive';
  if (r.startsWith('backfilled unrecorded purchase')) return 'Backfilled by Inventory Guardian';
  if (r.startsWith('split from bundle')) return 'Split from bundle receive';
  if (r.startsWith('restock')) return 'Direct restock';
  return reason || 'Restock';
}

/**
 * Stock-in history for one product, split by whether it went through the
 * purchase workflow (management taps Buy -> PO -> inventory receives it) or
 * landed in stock some other way (unexpected delivery, bulk receive, direct
 * restock, or a staff request received without ever being bought).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: 'productId query param is required' }, { status: 400 });
    }

    const [poRes, movRes] = await Promise.all([
      supabase
        .from('purchase_order_items')
        .select(`
          id, expected_qty, received_qty, unit_cost, status, created_at, requested_by_name,
          suppliers(name),
          purchase_orders!inner(notes, created_at)
        `)
        .eq('product_id', productId),
      supabase
        .from('inventory_movements')
        .select('id, quantity_change, movement_type, timestamp, reason, supplier_name, unit_cost')
        .eq('product_id', productId)
        .gt('quantity_change', 0)
        .or('movement_type.ilike.restock,movement_type.eq.initial_stock'),
    ]);

    if (poRes.error) throw poRes.error;
    if (movRes.error) throw movRes.error;

    const purchased: any[] = [];
    const direct: any[] = [];

    (poRes.data || []).forEach((i: any) => {
      const receivedQty = Number(i.received_qty) || 0;
      const expectedQty = Number(i.expected_qty) || 0;
      const base = {
        id: `po-${i.id}`,
        receivedQty,
        unitCost: Number(i.unit_cost) || 0,
        supplierName: i.suppliers?.name || null,
      };

      if (i.purchase_orders?.notes === 'STAFF_DRAFT') {
        // A draft is only a staff request. It counts as stock-in only once
        // inventory received it straight off the sheet without a Buy.
        if (receivedQty <= 0) return;
        direct.push({
          ...base,
          date: i.created_at,
          dateLabel: 'Requested',
          label: 'Received off staff request sheet (never bought)',
          detail: i.requested_by_name ? `Requested by ${i.requested_by_name}` : null,
        });
        return;
      }

      purchased.push({
        ...base,
        date: i.purchase_orders?.created_at || i.created_at,
        dateLabel: 'Bought',
        expectedQty,
        status: receivedQty >= expectedQty && expectedQty > 0 ? 'received' : receivedQty > 0 ? 'partial' : 'awaiting',
        label: i.purchase_orders?.notes || 'Purchase',
        detail: null,
      });
    });

    (movRes.data || []).forEach((m: any) => {
      const reason = (m.reason || '').trim();
      if (PO_RECEIPT_REASONS.some((p) => reason.toLowerCase().startsWith(p))) return;
      direct.push({
        id: `mov-${m.id}`,
        date: m.timestamp,
        dateLabel: 'Received',
        receivedQty: Number(m.quantity_change) || 0,
        unitCost: Number(m.unit_cost) || 0,
        supplierName: m.supplier_name || null,
        label: describeDirectReceipt(m.movement_type || '', reason),
        detail: null,
      });
    });

    const byNewest = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
    purchased.sort(byNewest);
    direct.sort(byNewest);

    const sum = (rows: any[]) => rows.reduce((acc, r) => acc + r.receivedQty, 0);

    return NextResponse.json({
      purchased,
      direct,
      purchasedQty: sum(purchased),
      directQty: sum(direct),
    });
  } catch (error: any) {
    console.error('Error fetching receive history:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
