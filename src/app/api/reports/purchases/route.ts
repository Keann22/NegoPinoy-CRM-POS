import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start/end parameters' }, { status: 400 });
    }

    // A "purchase" is any purchase_order_items row whose parent PO is not a
    // STAFF_DRAFT (drafts are staff *requests*, not recorded buys). The PO row
    // is created at the moment "Buy" is tapped, so its created_at is the true
    // buying timestamp — the item's own created_at can predate the purchase
    // when a staff draft item gets converted in place.
    //
    // NOTE: buy-flow POs have notes = null, and a plain .neq('notes',
    // 'STAFF_DRAFT') silently drops null rows (SQL null semantics), so the
    // null case must be matched explicitly.
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await supabase
        .from('purchase_order_items')
        .select(`
          id, product_id, expected_qty, received_qty, unit_cost, status, supplier_id,
          purchase_orders!inner(id, notes, created_at),
          products(name, variant_name),
          suppliers(name)
        `)
        .or('notes.is.null,notes.neq.STAFF_DRAFT', { foreignTable: 'purchase_orders' })
        .gte('purchase_orders.created_at', start)
        .lte('purchase_orders.created_at', end)
        .order('id', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      if (!page || page.length === 0) break;
      rows.push(...page);
      if (page.length < 1000) break;
    }

    const purchases = rows.map((r: any) => {
      const prod = r.products;
      let productName = prod?.name || 'Unknown Product';
      if (prod?.variant_name && !productName.includes(prod.variant_name)) {
        productName = `${productName} [${prod.variant_name}]`;
      }
      const qty = Number(r.expected_qty) || 0;
      const unitCost = Number(r.unit_cost) || 0;
      return {
        id: r.id,
        productId: r.product_id,
        productName,
        qty,
        receivedQty: Number(r.received_qty) || 0,
        unitCost,
        totalCost: qty * unitCost,
        supplierId: r.supplier_id,
        supplierName: r.suppliers?.name || null,
        status: r.status,
        batchName: r.purchase_orders?.notes || null,
        purchasedAt: r.purchase_orders?.created_at,
      };
    });

    purchases.sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());

    return NextResponse.json({ purchases });
  } catch (error: any) {
    console.error('Error in purchases report GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
