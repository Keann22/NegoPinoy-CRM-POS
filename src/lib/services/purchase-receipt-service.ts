import type { SupabaseClient } from '@supabase/supabase-js';
import { readReceiptImage, buildCandidates, matchLine, type LineMatch } from '@/lib/receipt-matching';
import { processProcurementPurchases } from '@/lib/services/procurement-purchase-service';

/**
 * Snap receipt. The owners photograph a receipt at the store and are done.
 * Each photo is stored privately, read, and every line we're sure about is
 * recorded as a purchase straight away (so Jas can receive it). Lines we're
 * not sure about wait on Receiving for staff to match while unpacking; staff
 * only ever see the receipt's item text, never prices or the supplier.
 * Staff matches are remembered per supplier, so the same line matches by
 * itself next time.
 */

export const RECEIPT_BUCKET = 'purchase-receipts';
// Stricter than the Scan Receipt shortlist threshold: these get recorded
// without anyone looking, so only near-certain name matches qualify.
const AUTO_NAME_THRESHOLD = 0.6;

export type ReceiptEditor = { id: string; name: string; isManagement: boolean };
export type LineAction = 'product' | 'not_product' | 'not_in_list';

export const textKey = (s: string | null | undefined) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const supplierKeyOf = (supplierId: string | null | undefined) => supplierId || '';

const wholeQty = (q: unknown) => Math.max(1, Math.round(Number(q) || 1));

/** Open staff requests (to-buy list) for these products, so a purchase takes them over. */
async function draftItemIds(supabase: SupabaseClient, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, string>();
  const { data } = await supabase
    .from('purchase_order_items')
    .select('id, product_id, purchase_orders!inner(notes)')
    .eq('purchase_orders.notes', 'STAFF_DRAFT')
    .eq('status', 'pending_receipt')
    .in('product_id', productIds);
  return new Map((data || []).map((d: any) => [d.product_id as string, d.id as string]));
}

/** Bundles hold no stock; procurement tracks their parts. */
async function bundleIds(supabase: SupabaseClient, productIds: string[]) {
  if (productIds.length === 0) return new Set<string>();
  const { data } = await supabase.from('products').select('id, assembly_recipe').in('id', productIds);
  return new Set((data || []).filter((p: any) => Array.isArray(p.assembly_recipe) && p.assembly_recipe.length > 0).map((p: any) => p.id as string));
}

/** Record purchases exactly like Buy on the Procurement Sheet. Returns the new PO id. */
async function recordPurchases(
  supabase: SupabaseClient,
  lines: { productId: string; qty: number; cost: number }[],
  supplierId: string | null,
  actorName: string
) {
  const drafts = await draftItemIds(supabase, lines.map((l) => l.productId));
  return processProcurementPurchases(
    supabase,
    lines.map((l) => ({ ...l, supplierId, draftItemId: drafts.get(l.productId) || null })),
    null,
    actorName
  );
}

export async function createReceipt(supabase: SupabaseClient, supplierId: string | null, editor: ReceiptEditor) {
  const { data, error } = await supabase
    .from('purchase_receipts')
    .insert({ supplier_id: supplierId || null, created_by_id: editor.id, created_by_name: editor.name })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function processReceiptPhoto(
  supabase: SupabaseClient,
  { receiptId, imageBase64, editor }: { receiptId: string; imageBase64: string; editor: ReceiptEditor }
) {
  const { data: receipt, error: rErr } = await supabase
    .from('purchase_receipts').select('id, supplier_id').eq('id', receiptId).single();
  if (rErr || !receipt) throw new Error('Receipt not found');
  const supplierId: string | null = receipt.supplier_id;

  // 1. Keep the photo, privately.
  const photoId = crypto.randomUUID();
  const path = `${receiptId}/${photoId}.jpg`;
  const bytes = Buffer.from(imageBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  const { error: upErr } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, bytes, { contentType: 'image/jpeg' });
  if (upErr) throw new Error(`Could not save the photo: ${upErr.message}`);
  const { error: phErr } = await supabase
    .from('purchase_receipt_photos').insert({ id: photoId, receipt_id: receiptId, storage_path: path });
  if (phErr) throw phErr;

  try {
    // 2. Read it.
    const { engine, lines } = await readReceiptImage(imageBase64);
    if (lines.length === 0) {
      await supabase.from('purchase_receipt_photos')
        .update({ status: 'failed', engine, error: "Couldn't read any items" }).eq('id', photoId);
      return { lines: 0, recorded: 0, toMatch: 0, engine };
    }

    // 3. Match: remembered staff matches first, then supplier code / strong name match.
    const keys = lines.map((l) => textKey(l.description || l.rawText)).filter(Boolean);
    const { data: aliases } = await supabase
      .from('receipt_line_aliases').select('text_key, product_id')
      .eq('supplier_key', supplierKeyOf(supplierId)).in('text_key', keys.length ? keys : ['']);
    const aliasByKey = new Map((aliases || []).map((a: any) => [a.text_key as string, a.product_id as string]));
    const { candidates } = await buildCandidates(supabase, supplierId);

    const matched = lines.map((line) => {
      const aliasProduct = aliasByKey.get(textKey(line.description || line.rawText));
      const m: Pick<LineMatch, 'productId' | 'matchedBy'> | null = aliasProduct
        ? { productId: aliasProduct, matchedBy: 'alias' }
        : matchLine(line, candidates, AUTO_NAME_THRESHOLD);
      return { line, match: m };
    });
    const bundles = await bundleIds(supabase, matched.filter((x) => x.match).map((x) => x.match!.productId));
    matched.forEach((x) => { if (x.match && bundles.has(x.match.productId)) x.match = null; });

    // 4. Record the sure ones as one purchase (same product on several lines adds up).
    const byProduct = new Map<string, { productId: string; qty: number; cost: number }>();
    matched.forEach(({ line, match }) => {
      if (!match) return;
      const agg = byProduct.get(match.productId) || { productId: match.productId, qty: 0, cost: 0 };
      agg.qty += wholeQty(line.qty);
      if (Number(line.unitCost) > 0) agg.cost = Number(line.unitCost);
      byProduct.set(match.productId, agg);
    });
    const poId = byProduct.size > 0
      ? await recordPurchases(supabase, Array.from(byProduct.values()), supplierId, editor.name)
      : null;

    // 5. Keep every line, so the receipt can be checked later.
    const rows = matched.map(({ line, match }) => ({
      receipt_id: receiptId,
      photo_id: photoId,
      raw_text: line.rawText,
      description: line.description || line.rawText,
      code: line.code,
      qty: wholeQty(line.qty),
      unit_cost: Number(line.unitCost) || 0,
      status: match ? 'recorded' : 'unmatched',
      product_id: match?.productId || null,
      po_id: match ? poId : null,
      matched_by: match?.matchedBy || null,
    }));
    const { error: lnErr } = await supabase.from('purchase_receipt_lines').insert(rows);
    if (lnErr) throw lnErr;

    await supabase.from('purchase_receipt_photos').update({ status: 'read', engine }).eq('id', photoId);
    const recorded = rows.filter((r) => r.status === 'recorded').length;
    return { lines: rows.length, recorded, toMatch: rows.length - recorded, engine };
  } catch (e: any) {
    await supabase.from('purchase_receipt_photos')
      .update({ status: 'failed', error: String(e?.message || e).slice(0, 300) }).eq('id', photoId);
    throw e;
  }
}

/** Staff view: the receipt's item text only. No prices, quantities or supplier. */
export async function listLinesToMatch(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('purchase_receipt_lines')
    .select('id, description, created_at')
    .eq('status', 'unmatched')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data || []).map((l: any) => ({ id: l.id, description: l.description, createdAt: l.created_at }));
}

export async function resolveLine(
  supabase: SupabaseClient,
  { lineId, action, productId, editor }: { lineId: string; action: LineAction; productId?: string; editor: ReceiptEditor }
) {
  const { data: line, error } = await supabase
    .from('purchase_receipt_lines')
    .select('id, status, description, qty, unit_cost, purchase_receipts!inner(supplier_id)')
    .eq('id', lineId).single();
  if (error || !line) throw new Error('Receipt line not found');
  if (line.status !== 'unmatched') throw new Error('Someone already handled this line. Refresh the page.');

  const done = { resolved_by_name: editor.name, resolved_at: new Date().toISOString() };
  if (action !== 'product') {
    const { error: uErr } = await supabase.from('purchase_receipt_lines').update({ status: action, ...done }).eq('id', lineId);
    if (uErr) throw uErr;
    return;
  }

  if (!productId) throw new Error('Pick the product first.');
  if ((await bundleIds(supabase, [productId])).size > 0) {
    throw new Error('That is a bundle. Pick the actual item that arrived.');
  }
  const supplierId: string | null = (line as any).purchase_receipts?.supplier_id || null;
  const poId = await recordPurchases(
    supabase,
    [{ productId, qty: wholeQty(line.qty), cost: Number(line.unit_cost) || 0 }],
    supplierId,
    editor.name
  );
  const { error: uErr } = await supabase.from('purchase_receipt_lines')
    .update({ status: 'recorded', product_id: productId, po_id: poId, matched_by: 'staff', ...done }).eq('id', lineId);
  if (uErr) throw uErr;

  // Remember it for next time.
  const key = textKey(line.description);
  if (key) {
    await supabase.from('receipt_line_aliases').upsert(
      { supplier_key: supplierKeyOf(supplierId), text_key: key, product_id: productId, created_by_name: editor.name },
      { onConflict: 'supplier_key,text_key' }
    );
  }
}

/** Admin view of recent receipts: who snapped, supplier, and what happened to each line. */
export async function listRecentReceipts(supabase: SupabaseClient, days = 3) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('purchase_receipts')
    .select('id, created_at, created_by_name, supplier_id, suppliers(name), purchase_receipt_photos(id, status, error), purchase_receipt_lines(id, status, description, qty, unit_cost)')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any) => {
    const lines = r.purchase_receipt_lines || [];
    const count = (s: string) => lines.filter((l: any) => l.status === s).length;
    return {
      id: r.id,
      createdAt: r.created_at,
      createdBy: r.created_by_name,
      supplierName: r.suppliers?.name || null,
      photos: (r.purchase_receipt_photos || []).map((p: any) => ({ id: p.id, status: p.status, error: p.error })),
      recorded: count('recorded'),
      toMatch: count('unmatched'),
      notProduct: count('not_product'),
      notInList: lines.filter((l: any) => l.status === 'not_in_list')
        .map((l: any) => ({ id: l.id, description: l.description, qty: Number(l.qty), unitCost: Number(l.unit_cost) })),
    };
  });
}
