import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { fetchPurchasesInRange, isManagementUser } from '@/lib/services/purchase-summary-service';

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

    const purchases = await fetchPurchasesInRange(supabase, start, end);

    // Stock that physically arrived but was never costed. Inventory can receive
    // a STAFF_DRAFT item straight off the to-order sheet (see
    // /api/inventory/receive/pending-pos), which bumps stock at unit_cost 0 and
    // leaves supplier_id null — so the buy never reaches this report and the
    // pieces land in inventory with no cost basis. Deliberately NOT date-scoped:
    // the receipt timestamp lives on inventory_movements, not on the item, so
    // there is no honest way to bucket these into the selected range. This is a
    // standing backlog to clear, not a figure for the period.
    const unrecordedRows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await supabase
        .from('purchase_order_items')
        .select(`
          id, product_id, expected_qty, received_qty, unit_cost, supplier_id, requested_by_name,
          purchase_orders!inner(notes),
          products(name, variant_name, initial_unit_cost, supplier_pricing)
        `)
        .gt('received_qty', 0)
        .or('supplier_id.is.null,unit_cost.is.null,unit_cost.eq.0')
        .order('id', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      if (!page || page.length === 0) break;
      unrecordedRows.push(...page);
      if (page.length < 1000) break;
    }

    // What these products actually last cost. products.initial_unit_cost is
    // almost always 0 here and supplier_pricing usually records WHO supplies a
    // product with unitCost 0, so neither is a usable price source - the real
    // history is the last purchase_order_items line that carried a cost.
    const uncostedProductIds = Array.from(new Set(unrecordedRows.map((r: any) => r.product_id).filter(Boolean)));
    const lastPurchaseByProduct = new Map<string, { unitCost: number; supplierId: string | null; supplierName: string | null; purchasedAt: string | null }>();
    const lastMovementByProduct = new Map<string, { unitCost: number; supplierName: string | null }>();
    // When the goods actually landed - this is the day the buy will be filed under.
    const receiptDateByProduct = new Map<string, string>();

    for (let i = 0; i < uncostedProductIds.length; i += 100) {
      const chunk = uncostedProductIds.slice(i, i + 100);
      const { data: priorRows } = await supabase
        .from('purchase_order_items')
        .select('product_id, unit_cost, supplier_id, purchase_orders!inner(created_at), suppliers(name)')
        .in('product_id', chunk)
        .gt('unit_cost', 0);

      const { data: receiptRows } = await supabase
        .from('inventory_movements')
        .select('product_id, timestamp, unit_cost, supplier_name')
        .in('product_id', chunk)
        .ilike('movement_type', 'restock')
        .order('timestamp', { ascending: false });

      (receiptRows || []).forEach((row: any) => {
        // Ordered newest-first, so the first hit per product is the latest receipt.
        if (!receiptDateByProduct.has(row.product_id)) {
          receiptDateByProduct.set(row.product_id, row.timestamp);
        }
        if (Number(row.unit_cost) > 0 && !lastMovementByProduct.has(row.product_id)) {
          lastMovementByProduct.set(row.product_id, {
            unitCost: Number(row.unit_cost),
            supplierName: row.supplier_name || null,
          });
        }
      });

      (priorRows || []).forEach((row: any) => {
        const purchasedAt = row.purchase_orders?.created_at || null;
        const existing = lastPurchaseByProduct.get(row.product_id);
        // Keep the most recent priced purchase per product.
        if (!existing || (purchasedAt && existing.purchasedAt && new Date(purchasedAt) > new Date(existing.purchasedAt))) {
          lastPurchaseByProduct.set(row.product_id, {
            unitCost: Number(row.unit_cost) || 0,
            supplierId: row.supplier_id || null,
            supplierName: row.suppliers?.name || null,
            purchasedAt,
          });
        }
      });
    }

    // Helper for finding clean base prefix of variant/family products
    const getBasePrefix = (name: string): string => {
      const n = name.trim();
      const parts = n.split(' - ');
      if (parts.length > 2) {
        return `${parts[0].trim()} - ${parts[1].trim()}`.toLowerCase();
      }
      if (parts.length === 2) {
        return parts[0].trim().toLowerCase();
      }
      return n.split('(')[0].trim().toLowerCase();
    };

    // Load catalog products with positive prices to match variants/siblings (e.g. colors, sister sizes)
    const pricedProductsList: Array<{ id: string; name: string; cost: number; supplierId: string | null; prefix: string }> = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: pErr } = await supabase
        .from('products')
        .select('id, name, initial_unit_cost, supplier_id, supplier_pricing')
        .range(from, from + 999);
      if (pErr) break;
      if (!page || page.length === 0) break;
      for (const p of page) {
        let cost = Number(p.initial_unit_cost) || 0;
        let supplierId = p.supplier_id || null;
        const pricing = Array.isArray(p.supplier_pricing) ? p.supplier_pricing : [];
        const validEntry = pricing.find((item: any) => Number(item.unitCost) > 0);
        if (!cost && validEntry) {
          cost = Number(validEntry.unitCost);
          supplierId = supplierId || validEntry.supplierId || null;
        }
        if (cost > 0) {
          pricedProductsList.push({
            id: p.id,
            name: p.name,
            cost,
            supplierId,
            prefix: getBasePrefix(p.name),
          });
        }
      }
      if (page.length < 1000) break;
    }

    const groupedUnrecorded = new Map<string, any>();

    unrecordedRows.forEach((r: any) => {
      const source = r.purchase_orders?.notes === 'STAFF_DRAFT' ? 'Staff to-order sheet' : (r.purchase_orders?.notes || 'Buy flow');
      const key = `${r.product_id}_${source}`;

      if (!groupedUnrecorded.has(key)) {
        const prod = r.products;
        let productName = prod?.name || 'Unknown Product';
        if (prod?.variant_name && !productName.includes(prod.variant_name)) {
          productName = `${productName} [${prod.variant_name}]`;
        }
        
        const pricing: any[] = prod?.supplier_pricing || [];
        const bookEntry = pricing.find((item: any) => Number(item.unitCost) > 0) || (pricing.length > 0 ? pricing[pricing.length - 1] : null);
        const lastPurchase = lastPurchaseByProduct.get(r.product_id) || null;
        const lastMovement = lastMovementByProduct.get(r.product_id) || null;

        // Check sibling / variant match by prefix
        const pPrefix = getBasePrefix(productName);
        const sisterMatch = pricedProductsList.find(
          item => item.id !== r.product_id && (item.prefix === pPrefix || item.name.toLowerCase().startsWith(pPrefix))
        ) || null;

        let suggestedUnitCost: number | null = null;
        let costSource: string | null = null;
        if (Number(r.unit_cost) > 0) {
          suggestedUnitCost = Number(r.unit_cost);
          costSource = 'already on this purchase';
        } else if (lastPurchase?.unitCost) {
          suggestedUnitCost = lastPurchase.unitCost;
          costSource = `last bought${lastPurchase.supplierName ? ` from ${lastPurchase.supplierName}` : ''}`;
        } else if (lastMovement?.unitCost) {
          suggestedUnitCost = lastMovement.unitCost;
          costSource = `from restock log${lastMovement.supplierName ? ` (${lastMovement.supplierName})` : ''}`;
        } else if (Number(prod?.initial_unit_cost) > 0) {
          suggestedUnitCost = Number(prod.initial_unit_cost);
          costSource = 'product default cost';
        } else if (Number(bookEntry?.unitCost) > 0) {
          suggestedUnitCost = Number(bookEntry.unitCost);
          costSource = 'supplier price book';
        } else if (sisterMatch?.cost) {
          suggestedUnitCost = sisterMatch.cost;
          costSource = `matched from ${sisterMatch.name}`;
        }

        const bookCost = Number(bookEntry?.unitCost) || 0;
        const costConflict = !!(lastPurchase?.unitCost && bookCost > 0 && bookCost !== lastPurchase.unitCost)
          ? { bookCost, lastPurchaseCost: lastPurchase.unitCost }
          : null;

        groupedUnrecorded.set(key, {
          id: [r.id],
          productName,
          expectedQty: Number(r.expected_qty) || 0,
          receivedQty: Number(r.received_qty) || 0,
          unitCost: Number(r.unit_cost) || 0,
          missingSupplier: !r.supplier_id,
          missingCost: !(Number(r.unit_cost) > 0),
          requestedByName: r.requested_by_name ? new Set([r.requested_by_name]) : new Set(),
          source,
          suggestedSupplierId: lastPurchase?.supplierId || bookEntry?.supplierId || sisterMatch?.supplierId || null,
          suggestedUnitCost,
          costSource,
          costSourceDate: lastPurchase?.purchasedAt || null,
          costConflict,
          receivedAt: receiptDateByProduct.get(r.product_id) || null,
        });
      } else {
        const g = groupedUnrecorded.get(key);
        g.id.push(r.id);
        g.expectedQty += Number(r.expected_qty) || 0;
        g.receivedQty += Number(r.received_qty) || 0;
        if (r.requested_by_name) g.requestedByName.add(r.requested_by_name);
        g.missingSupplier = g.missingSupplier || !r.supplier_id;
        g.missingCost = g.missingCost || !(Number(r.unit_cost) > 0);
      }
    });

    const unrecorded = Array.from(groupedUnrecorded.values()).map(g => {
      g.id = g.id.join(',');
      g.requestedByName = Array.from(g.requestedByName).join(', ') || null;
      return g;
    }).sort((a, b) => b.receivedQty - a.receivedQty);

    const { data: supplierRows } = await supabase
      .from('suppliers')
      .select('id, name')
      .order('name');

    // Enforce the confidentiality tier server-side so supplier names and costs
    // never leave the server for non-management callers (the client also hides
    // them, but that alone leaks the values in the network response).
    const sessionClient = await createSessionClient();
    const { data: { user } } = await sessionClient.auth.getUser();

    if (!isManagementUser(user)) {
      const safePurchases = purchases.map(p => ({
        ...p,
        supplierId: null,
        supplierName: null,
        unitCost: 0,
        totalCost: 0,
      }));
      const safeUnrecorded = unrecorded.map(u => ({
        ...u,
        unitCost: 0,
        suggestedSupplierId: null,
        suggestedUnitCost: null,
        costSource: null,
        costSourceDate: null,
        costConflict: null,
      }));
      return NextResponse.json({ purchases: safePurchases, unrecorded: safeUnrecorded, suppliers: [] });
    }

    return NextResponse.json({ purchases, unrecorded, suppliers: supplierRows || [] });
  } catch (error: any) {
    console.error('Error in purchases report GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
