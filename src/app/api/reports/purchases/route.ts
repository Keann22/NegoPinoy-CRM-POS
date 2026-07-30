import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Supplier identities and costs are management-only. Roles live in the user's
// metadata (same source the dashboard reads via useUserProfile). We check both
// app_metadata (server-controlled, preferred) and user_metadata, and default to
// deny — no session, or no recognised role, means staff-level access.
function isManagementUser(user: any): boolean {
  const collect = (meta: any): string[] => {
    if (!meta) return [];
    if (Array.isArray(meta.roles)) return meta.roles.map((r: string) => String(r).toLowerCase());
    if (meta.role) return [String(meta.role).toLowerCase()];
    return [];
  };
  const roles = [...collect(user?.app_metadata), ...collect(user?.user_metadata)];
  return roles.includes('owner') || roles.includes('admin');
}

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
        .select('product_id, timestamp')
        .in('product_id', chunk)
        .ilike('movement_type', 'restock')
        .order('timestamp', { ascending: false });

      (receiptRows || []).forEach((row: any) => {
        // Ordered newest-first, so the first hit per product is the latest receipt.
        if (!receiptDateByProduct.has(row.product_id)) {
          receiptDateByProduct.set(row.product_id, row.timestamp);
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

    const unrecorded = unrecordedRows.map((r: any) => {
      const prod = r.products;
      let productName = prod?.name || 'Unknown Product';
      if (prod?.variant_name && !productName.includes(prod.variant_name)) {
        productName = `${productName} [${prod.variant_name}]`;
      }
      // Pre-fill so clearing the backlog is a confirm rather than a lookup, but
      // always say where the number came from - a price book entry can disagree
      // with what was actually paid (pack price recorded against a unit, say),
      // and silently accepting the wrong one bakes a bad cost into COGS.
      const pricing: any[] = prod?.supplier_pricing || [];
      const bookEntry = pricing.length > 0 ? pricing[pricing.length - 1] : null;
      const lastPurchase = lastPurchaseByProduct.get(r.product_id) || null;

      let suggestedUnitCost: number | null = null;
      let costSource: string | null = null;
      if (Number(r.unit_cost) > 0) {
        suggestedUnitCost = Number(r.unit_cost);
        costSource = 'already on this purchase';
      } else if (lastPurchase?.unitCost) {
        suggestedUnitCost = lastPurchase.unitCost;
        costSource = `last bought${lastPurchase.supplierName ? ` from ${lastPurchase.supplierName}` : ''}`;
      } else if (Number(prod?.initial_unit_cost) > 0) {
        suggestedUnitCost = Number(prod.initial_unit_cost);
        costSource = 'product default cost';
      } else if (Number(bookEntry?.unitCost) > 0) {
        suggestedUnitCost = Number(bookEntry.unitCost);
        costSource = 'supplier price book';
      }

      // Flag when the price book and the last real purchase disagree, so the
      // number on screen gets a second look instead of a reflex Save.
      const bookCost = Number(bookEntry?.unitCost) || 0;
      const costConflict = !!(lastPurchase?.unitCost && bookCost > 0 && bookCost !== lastPurchase.unitCost)
        ? { bookCost, lastPurchaseCost: lastPurchase.unitCost }
        : null;

      return {
        id: r.id,
        productName,
        expectedQty: Number(r.expected_qty) || 0,
        receivedQty: Number(r.received_qty) || 0,
        unitCost: Number(r.unit_cost) || 0,
        missingSupplier: !r.supplier_id,
        missingCost: !(Number(r.unit_cost) > 0),
        requestedByName: r.requested_by_name || null,
        source: r.purchase_orders?.notes === 'STAFF_DRAFT' ? 'Staff to-order sheet' : (r.purchase_orders?.notes || 'Buy flow'),
        suggestedSupplierId: lastPurchase?.supplierId || bookEntry?.supplierId || null,
        suggestedUnitCost,
        costSource,
        costSourceDate: lastPurchase?.purchasedAt || null,
        costConflict,
        receivedAt: receiptDateByProduct.get(r.product_id) || null,
      };
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
