import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const UNPICKED_STATUSES = [
  'Pending Payment',
  'Processing',
  'Waiting for Stock',
  'On-Hold'
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    const range = searchParams.get('range') || 'recent'; // 'recent' (since yesterday), 'today', 'all'

    // Case 1: Deep Trail for a single product
    if (productId) {
      const [productRes, movementsRes, guardianMemoriesRes, ordersRes] = await Promise.all([
        supabase.from('products').select('*').eq('id', productId).single(),
        supabase
          .from('inventory_movements')
          .select('*')
          .eq('product_id', productId)
          .order('timestamp', { ascending: false })
          .limit(100),
        supabase
          .from('inventory_guardian_memory')
          .select('*')
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('order_items')
          .select('id, order_id, quantity, is_packed, orders!inner(id, status, payment_method, order_date, customers(full_name))')
          .eq('product_id', productId)
          .in('orders.status', [...UNPICKED_STATUSES, 'Picked (with issue)'])
      ]);

      if (productRes.error || !productRes.data) {
        return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        product: productRes.data,
        movements: movementsRes.data || [],
        guardianMemories: guardianMemoriesRes.data || [],
        activeOrders: ordersRes.data || []
      });
    }

    // Case 2: List of all products alerted since yesterday
    let sinceDateUtc: string | null = null;
    const now = new Date();

    if (range === 'today') {
      const phNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const todayStr = phNow.toISOString().slice(0, 10);
      sinceDateUtc = new Date(`${todayStr}T00:00:00+08:00`).toISOString();
    } else if (range === 'recent') {
      // Since yesterday 00:00 Philippine time
      const phYesterday = new Date(now.getTime() + 8 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
      const yestStr = phYesterday.toISOString().slice(0, 10);
      sinceDateUtc = new Date(`${yestStr}T00:00:00+08:00`).toISOString();
    }

    let memoryQuery = supabase
      .from('inventory_guardian_memory')
      .select('id, product_id, action_type, physical_count, system_stock_before, notes, metadata, created_at, actor_name')
      .eq('action_type', 'anomaly_notified')
      .order('created_at', { ascending: false });

    if (sinceDateUtc) {
      memoryQuery = memoryQuery.gte('created_at', sinceDateUtc);
    }

    const { data: alertMemories, error: mErr } = await memoryQuery;
    if (mErr) throw mErr;

    if (!alertMemories || alertMemories.length === 0) {
      return NextResponse.json({ success: true, items: [], totalAlerts: 0 });
    }

    // Group alerts by product_id
    const alertsByProduct = new Map<string, any[]>();
    for (const mem of alertMemories) {
      if (!mem.product_id) continue;
      const list = alertsByProduct.get(mem.product_id) || [];
      list.push(mem);
      alertsByProduct.set(mem.product_id, list);
    }

    const productIds = Array.from(alertsByProduct.keys());

    // Fetch product details
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id, name, variant_name, sku, stock_level, shelf_location, selling_price, initial_unit_cost, images')
      .in('id', productIds);

    if (pErr) throw pErr;

    // Fetch active unpicked reservations for these products
    const { data: activeOrderRows } = await supabase
      .from('order_items')
      .select('product_id, quantity, is_packed, orders!inner(id, status, payment_method)')
      .in('product_id', productIds)
      .in('orders.status', [...UNPICKED_STATUSES, 'Picked (with issue)']);

    const demandMap = new Map<string, { count: number; qty: number }>();
    for (const row of (activeOrderRows || [])) {
      if (row.is_packed) continue;
      const cur = demandMap.get(row.product_id) || { count: 0, qty: 0 };
      demandMap.set(row.product_id, {
        count: cur.count + 1,
        qty: cur.qty + (Number(row.quantity) || 1)
      });
    }

    // Fetch recent physical count audits for these products
    const { data: auditMemories } = await supabase
      .from('inventory_guardian_memory')
      .select('product_id, actor_name, physical_count, created_at, notes')
      .in('product_id', productIds)
      .eq('action_type', 'physical_count_audit')
      .order('created_at', { ascending: false });

    const auditMap = new Map<string, any>();
    for (const aud of (auditMemories || [])) {
      if (!auditMap.has(aud.product_id)) {
        auditMap.set(aud.product_id, aud);
      }
    }

    // Assemble unified review rows
    const items = (products || []).map(p => {
      const pAlerts = alertsByProduct.get(p.id) || [];
      const latestAlert = pAlerts[0];
      const demand = demandMap.get(p.id) || { count: 0, qty: 0 };
      const lastAudit = auditMap.get(p.id) || null;

      const anomalyId = latestAlert?.metadata?.anomalyId || '';
      let anomalyTypeLabel = 'Stock Discrepancy';
      if (anomalyId.startsWith('unrecorded-')) {
        anomalyTypeLabel = 'Ghost Negative Stock (0 Orders)';
      } else if (anomalyId.startsWith('partial-unrecorded-')) {
        anomalyTypeLabel = 'Deficit Exceeds Orders';
      } else if (anomalyId.startsWith('picker-issue-')) {
        anomalyTypeLabel = 'Floor Shortage Reported';
      }

      return {
        productId: p.id,
        name: p.name,
        variantName: p.variant_name,
        sku: p.sku,
        shelfLocation: p.shelf_location || '-',
        currentStock: p.stock_level ?? 0,
        sellingPrice: p.selling_price,
        image: p.images?.[0] || null,
        alertCount: pAlerts.length,
        latestAlertAt: latestAlert?.created_at,
        firstAlertAt: pAlerts[pAlerts.length - 1]?.created_at,
        latestAnomalyType: anomalyTypeLabel,
        latestAlertNotes: latestAlert?.notes || '',
        stockBeforeAlert: latestAlert?.system_stock_before,
        openOrdersCount: demand.count,
        openOrdersQty: demand.qty,
        lastPhysicalAudit: lastAudit ? {
          actorName: lastAudit.actor_name,
          physicalCount: lastAudit.physical_count,
          auditedAt: lastAudit.created_at,
          notes: lastAudit.notes
        } : null
      };
    });

    // Sort by latest alert descending
    items.sort((a, b) => new Date(b.latestAlertAt).getTime() - new Date(a.latestAlertAt).getTime());

    return NextResponse.json({
      success: true,
      items,
      totalAlerts: alertMemories.length,
      uniqueProductsCount: items.length
    });
  } catch (error: any) {
    console.error('Error in alert-review API route:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
