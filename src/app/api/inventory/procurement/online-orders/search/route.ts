import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import type { OnlineOrderSearchResult, OnlineOrderItem } from '@/types';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function determinePlatform(route: string | null, supplierName: string | null): 'Pinduoduo' | 'Shopee' | 'Other' {
  const s = (supplierName || '').toLowerCase();
  if (route === 'china_import' || /pin\s*d|pdd|china/.test(s)) return 'Pinduoduo';
  if (route === 'local' || /shopee|lazada|tiktok/.test(s)) return 'Shopee';
  return 'Other';
}

export async function GET(req: Request) {
  try {
    const sessionClient = await createSessionClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!isManagementUser(user)) {
      return NextResponse.json({ error: 'Only an admin can search online orders.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const platformFilter = searchParams.get('platform') || 'all';
    const statusFilter = searchParams.get('status') || 'all';

    let targetPoIds: string[] | null = null;

    if (q) {
      // 1. Search purchase_orders by platform_order_no or tracking_no
      const { data: matchedPos, error: poErr } = await supabase
        .from('purchase_orders')
        .select('id')
        .or(`platform_order_no.ilike.%${q}%,tracking_no.ilike.%${q}%`);

      if (poErr) throw poErr;

      // 2. Search products by name or variant_name
      const { data: matchedProducts, error: prodErr } = await supabase
        .from('products')
        .select('id')
        .or(`name.ilike.%${q}%,variant_name.ilike.%${q}%`)
        .limit(100);

      if (prodErr) throw prodErr;

      let matchedPoIdsFromProducts: string[] = [];
      if (matchedProducts && matchedProducts.length > 0) {
        const productIds = matchedProducts.map((p) => p.id);
        const { data: itemRows, error: itemErr } = await supabase
          .from('purchase_order_items')
          .select('po_id')
          .in('product_id', productIds)
          .limit(200);

        if (itemErr) throw itemErr;
        matchedPoIdsFromProducts = (itemRows || []).map((r) => r.po_id);
      }

      const allIds = new Set<string>([
        ...(matchedPos || []).map((p) => p.id),
        ...matchedPoIdsFromProducts,
      ]);

      if (allIds.size === 0) {
        return NextResponse.json({ orders: [] });
      }

      targetPoIds = Array.from(allIds);
    }

    // Query POs
    let poQuery = supabase
      .from('purchase_orders')
      .select(`
        id,
        created_at,
        status,
        tracking_route,
        tracking_stage,
        platform_order_no,
        tracking_no,
        expected_arrival,
        notes
      `)
      .neq('notes', 'STAFF_DRAFT')
      .order('created_at', { ascending: false });

    if (targetPoIds) {
      poQuery = poQuery.in('id', targetPoIds);
    } else {
      // When no search query, prioritize orders that have online tracking or order number
      poQuery = poQuery
        .or('platform_order_no.not.is.null,tracking_no.not.is.null,tracking_route.not.is.null')
        .limit(50);
    }

    if (statusFilter === 'pending') {
      poQuery = poQuery.eq('status', 'pending_receipt');
    } else if (statusFilter === 'received') {
      poQuery = poQuery.eq('status', 'received');
    }

    const { data: pos, error: queryErr } = await poQuery;
    if (queryErr) throw queryErr;
    if (!pos || pos.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    const poIds = pos.map((p) => p.id);

    // Fetch items with product details and supplier
    const { data: items, error: itemsErr } = await supabase
      .from('purchase_order_items')
      .select(`
        id,
        po_id,
        product_id,
        expected_qty,
        received_qty,
        unit_cost,
        products (name, variant_name, supplier_pricing),
        suppliers (name)
      `)
      .in('po_id', poIds);

    if (itemsErr) throw itemsErr;

    // Group items by po_id
    const itemsByPo = new Map<string, OnlineOrderItem[]>();
    const poSupplierMap = new Map<string, string>();

    for (const item of items || []) {
      const prod = Array.isArray(item.products) ? item.products[0] : item.products;
      const sup = Array.isArray(item.suppliers) ? item.suppliers[0] : item.suppliers;
      const supplierName = sup?.name || null;
      if (supplierName && !poSupplierMap.has(item.po_id)) {
        poSupplierMap.set(item.po_id, supplierName);
      }

      let displayName = prod?.name || 'Unknown Product';
      if (prod?.variant_name && !displayName.includes(prod.variant_name)) {
        displayName = `${displayName} [${prod.variant_name}]`;
      }

      const orderItem: OnlineOrderItem = {
        id: item.id,
        productId: item.product_id,
        productName: displayName,
        variantName: prod?.variant_name || null,
        expectedQty: Number(item.expected_qty) || 0,
        receivedQty: Number(item.received_qty) || 0,
        unitCost: Number(item.unit_cost) || 0,
        supplierName: supplierName,
      };

      const list = itemsByPo.get(item.po_id) || [];
      list.push(orderItem);
      itemsByPo.set(item.po_id, list);
    }

    const results: OnlineOrderSearchResult[] = [];

    for (const po of pos) {
      const supName = poSupplierMap.get(po.id) || null;
      const platform = determinePlatform(po.tracking_route, supName);

      // Filter by platform if specified
      if (platformFilter !== 'all') {
        if (platformFilter === 'pinduoduo' && platform !== 'Pinduoduo') continue;
        if (platformFilter === 'shopee' && platform !== 'Shopee') continue;
      }

      results.push({
        id: po.id,
        createdAt: po.created_at,
        status: po.status as 'pending_receipt' | 'received',
        trackingRoute: po.tracking_route,
        trackingStage: po.tracking_stage,
        platformOrderNo: po.platform_order_no,
        trackingNo: po.tracking_no,
        expectedArrival: po.expected_arrival,
        platform,
        supplierName: supName,
        items: itemsByPo.get(po.id) || [],
      });
    }

    return NextResponse.json({ orders: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Error in online-orders search GET:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
