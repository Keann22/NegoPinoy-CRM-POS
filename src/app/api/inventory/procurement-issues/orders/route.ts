import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { UNFULFILLED_STATUSES } from '@/lib/services/procurement-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const productId = url.searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }

    // Find bundle parents that consume this product as a component. An order
    // for a bundle (e.g. "Wok Pan with Takip") never references the component's
    // product_id in order_items — the demand only shows up via the bundle's
    // assembly_recipe — so those orders have to be discovered separately and
    // expanded. assembly_recipe defaults to `[]` (not null) on most products,
    // so filtering server-side would match nearly the whole table and silently
    // truncate at Supabase's 1000-row cap; page through and filter client-side.
    const bundleParents: { id: string; name: string | null; qtyPerBundle: number }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: bundleErr } = await supabase
        .from('products')
        .select('id, name, assembly_recipe')
        .range(from, from + 999);
      if (bundleErr) throw bundleErr;
      if (!page || page.length === 0) break;
      for (const bp of page as any[]) {
        const recipe = Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : [];
        const match = recipe.find((comp: any) => (comp.productId || comp.component_id) === productId);
        if (match) {
          bundleParents.push({ id: bp.id, name: bp.name, qtyPerBundle: match.quantity || 1 });
        }
      }
      if (page.length < 1000) break;
    }

    const qtyPerBundleById = new Map(bundleParents.map(b => [b.id, b.qtyPerBundle]));
    const bundleNameById = new Map(bundleParents.map(b => [b.id, b.name]));

    // Pull order_items for the product itself AND for any bundle parent that
    // consumes it, restricted to orders still waiting on stock (not yet picked).
    // Once an order is Picked/Photo/Packed/etc. a physical unit is already
    // secured, so it isn't actually blocked by this shortage — the same
    // narrower set the procurement sheet treats as "need to buy".
    const productIdsToMatch = [productId, ...bundleParents.map(b => b.id)];
    const { data: items, error: iErr } = await supabase
      .from('order_items')
      .select('product_id, quantity, is_packed, orders!inner(id, customer_id, status, sales_person_name, created_at, customers(name))')
      .in('product_id', productIdsToMatch)
      .in('orders.status', UNFULFILLED_STATUSES);

    if (iErr) throw iErr;

    // For "Picked (with issue)" orders, only the specific line(s) with an open
    // order_issue are actually still waiting — the rest were picked fine. Mirror
    // the procurement sheet's guard so a sibling line's issue doesn't drag an
    // already-secured item onto this panel. Keyed by order_id + the ordered
    // product_id (the bundle SKU for bundle orders, matching order_issues).
    const orderIds = Array.from(new Set((items || []).map((i: any) => i.orders.id)));
    const openIssueKeys = new Set<string>();
    if (orderIds.length > 0) {
      const { data: openIssues, error: oiErr } = await supabase
        .from('order_issues')
        .select('order_id, product_id')
        .eq('status', 'open')
        .in('product_id', productIdsToMatch)
        .in('order_id', orderIds);
      if (oiErr) throw oiErr;
      openIssues?.forEach((oi: any) => openIssueKeys.add(`${oi.order_id}-${oi.product_id}`));
    }

    const affectedOrders = (items || [])
      // An already-packed line has its unit secured — not blocked by this shortage.
      .filter((i: any) => !i.is_packed)
      // "Picked (with issue)" lines only count when this exact item is the one flagged.
      .filter((i: any) =>
        i.orders.status !== 'Picked (with issue)' ||
        openIssueKeys.has(`${i.orders.id}-${i.product_id}`)
      )
      .map((i: any) => {
        const viaBundle = i.product_id !== productId;
        const qtyPer = viaBundle ? (qtyPerBundleById.get(i.product_id) || 1) : 1;
        return {
          orderId: i.orders.id,
          customerId: i.orders.customer_id || null,
          quantityNeeded: i.quantity * qtyPer,
          status: i.orders.status,
          customerName: i.orders.customers?.name || 'Unknown Customer',
          salesPerson: i.orders.sales_person_name || 'Unknown',
          createdAt: i.orders.created_at,
          viaBundleName: viaBundle ? (bundleNameById.get(i.product_id) || 'Bundle') : null,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ orders: affectedOrders });
  } catch (error: any) {
    console.error('Error fetching affected orders:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
