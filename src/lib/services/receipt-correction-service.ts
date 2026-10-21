import { SupabaseClient } from '@supabase/supabase-js';
import { isConfirmedReason, isManagementUser } from './purchase-summary-service';
import { getAdminAndInventoryLeadNames, resolveRecipientNames, fanOutStaffNotifications } from './staff-message-service';

/**
 * Correcting a mis-counted receipt from Bulk Receive ("Received today" → Edit).
 *
 * One receipt changes several things at once: the purchase line's received qty,
 * stock in the warehouse it went into, and the RESTOCK movement. A correction
 * moves all of them together. The receipt movement is amended in place (deleted
 * when undone), so every report that reads it - Received tab, receive history,
 * Encode Costs - sees what actually arrived without needing to net anything. The
 * trail is a zero-quantity 'receipt_correction' note row plus an audit_logs entry.
 *
 * Only receipts made after the links were added (po_item_id / warehouse_id /
 * performed_by_id on inventory_movements) can be corrected here; older ones are
 * fixed with Adjust Stock as before.
 */

export const CORRECTION_TYPE = 'receipt_correction';

// Who received it and where. Written on every receipt from the pending queue.
export type ReceiptLinks = {
  po_item_id?: string | null;
  warehouse_id?: string | null;
  performed_by_id?: string | null;
  performed_by_name?: string | null;
};

const LINK_COLUMNS = ['po_item_id', 'warehouse_id', 'performed_by_id', 'performed_by_name', 'corrects_movement_id'];

// PostgREST says "column not found" with PGRST204; Postgres with 42703.
const isMissingColumn = (err: any) =>
  !!err && (err.code === 'PGRST204' || err.code === '42703') &&
  LINK_COLUMNS.some(c => String(err.message || '').includes(c));

/**
 * Insert a movement with its receipt links. If the migration hasn't run yet the
 * links are dropped and the plain movement is inserted, so receiving never
 * breaks because of them (that receipt just can't be edited later).
 */
export async function insertLinkedMovement(
  supabase: SupabaseClient,
  row: Record<string, any>,
  links: ReceiptLinks & { corrects_movement_id?: string | null },
): Promise<string | null> {
  const { data, error } = await supabase.from('inventory_movements').insert({ ...row, ...links }).select('id').single();
  if (!error) return data.id;
  if (!isMissingColumn(error)) throw error;
  console.warn('inventory_movements link columns missing - run scripts/migrations/add_receipt_links_to_movements.sql');
  const { data: plain, error: plainErr } = await supabase.from('inventory_movements').insert(row).select('id').single();
  if (plainErr) throw plainErr;
  return plain.id;
}

const phtDay = (d: Date | string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(d));

const phtTime = (d: Date | string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(d));

const displayName = (prod: any) => {
  let name = prod?.name || 'Unknown Product';
  if (prod?.variant_name && !name.includes(prod.variant_name)) name = `${name} [${prod.variant_name}]`;
  return name;
};

export type Editor = {
  id: string;
  name: string;
  email: string | null;
  isManagement: boolean;
};

/** The signed-in user as an editor (same name format the dashboard shows). */
export function editorFromUser(user: any): Editor | null {
  if (!user?.id) return null;
  const meta = user.user_metadata || {};
  const name = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff';
  return { id: user.id, name, email: user.email || null, isManagement: isManagementUser(user) };
}

/** Why this person can't edit this receipt, or null when they can. */
function lockReason(m: any, editor: Editor): string | null {
  if (!m.warehouse_id) return 'Received before editing was available - use Adjust Stock.';
  if (editor.isManagement) return null;
  if (m.performed_by_id !== editor.id) return `Received by ${m.performed_by_name || 'someone else'} - only they or an admin can edit it.`;
  if (phtDay(m.timestamp) !== phtDay(new Date())) return 'Only same-day receipts can be edited - ask an admin.';
  if (isConfirmedReason(m.reason)) return 'An admin already checked this receipt - ask an admin to change it.';
  return null;
}

export type ReceiptRow = {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  at: string;
  kind: 'purchase' | 'unexpected';
  shortNote: string | null;
  warehouseName: string | null;
  receivedBy: string | null;
  confirmed: boolean;
  stockLevel: number;
  canEdit: boolean;
  lockReason: string | null;
  corrections: { at: string; text: string }[];
};

export type UndoneRow = { id: string; productName: string; at: string; text: string };

/** Receipts made from the pending queue in [start, end], with any corrections. */
export async function listReceipts(
  supabase: SupabaseClient,
  start: string,
  end: string,
  editor: Editor,
): Promise<{ receipts: ReceiptRow[]; undone: UndoneRow[] }> {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select(`
      id, product_id, quantity_change, timestamp, reason, movement_type,
      po_item_id, warehouse_id, performed_by_id, performed_by_name, corrects_movement_id,
      products(name, variant_name, stock_level), warehouses(name)
    `)
    .not('performed_by_id', 'is', null)
    .or(`movement_type.ilike.restock,movement_type.eq.${CORRECTION_TYPE}`)
    .gte('timestamp', start)
    .lte('timestamp', end)
    .order('timestamp', { ascending: false })
    .limit(1000);
  if (error) throw error;
  const rows: any[] = data || [];

  // Corrections whose receipt was made on an earlier day still belong on it, but
  // only receipts in range are listed - the note is enough for those.
  const notesByReceipt = new Map<string, { at: string; text: string }[]>();
  const undone: UndoneRow[] = [];
  for (const r of rows) {
    if (r.movement_type !== CORRECTION_TYPE) continue;
    if (r.corrects_movement_id) {
      const list = notesByReceipt.get(r.corrects_movement_id) || [];
      list.push({ at: r.timestamp, text: r.reason });
      notesByReceipt.set(r.corrects_movement_id, list);
    } else if (String(r.reason || '').startsWith('Receipt undone')) {
      // Undoing deletes the receipt, which also unlinks any earlier "corrected"
      // notes on it (ON DELETE SET NULL). Only the undo itself is listed - one
      // line per undone receipt; the full history stays in the movement log.
      undone.push({ id: r.id, productName: displayName(r.products), at: r.timestamp, text: r.reason });
    }
  }

  const receipts: ReceiptRow[] = rows
    .filter(r => r.movement_type !== CORRECTION_TYPE)
    .map(r => {
      const reason: string = r.reason || '';
      const lock = lockReason(r, editor);
      return {
        id: r.id,
        productId: r.product_id,
        productName: displayName(r.products),
        qty: Number(r.quantity_change) || 0,
        at: r.timestamp,
        kind: reason.startsWith('Unexpected Delivery Item') ? 'unexpected' : 'purchase',
        shortNote: reason.startsWith('Short delivery') ? reason.replace(/ \[purchase confirmed\]$/, '') : null,
        warehouseName: r.warehouses?.name || null,
        receivedBy: r.performed_by_name || null,
        confirmed: isConfirmedReason(r.reason),
        stockLevel: Number(r.products?.stock_level) || 0,
        canEdit: !lock,
        lockReason: lock,
        corrections: (notesByReceipt.get(r.id) || []).sort((a, b) => a.at.localeCompare(b.at)),
      };
    });

  return { receipts, undone };
}

export type CorrectionResult = {
  oldQty: number;
  newQty: number;
  stockAfter: number;
  /** Units the purchase line is now waiting for again (back on Pending Incoming Items). */
  reopenedRemaining: number;
};

/**
 * Change what a receipt says arrived to `newQty` (0 = undo the receipt).
 */
export async function correctReceipt(
  supabase: SupabaseClient,
  movementId: string,
  newQty: number,
  note: string,
  editor: Editor,
): Promise<CorrectionResult> {
  if (!Number.isInteger(newQty) || newQty < 0) {
    throw new Error('Enter a whole number of 0 or more.');
  }

  const { data: m, error } = await supabase
    .from('inventory_movements')
    .select(`
      id, product_id, quantity_change, timestamp, reason, movement_type,
      po_item_id, warehouse_id, performed_by_id, performed_by_name,
      products(name, variant_name), warehouses(name)
    `)
    .eq('id', movementId)
    .single();
  if (error) throw error;

  if (String(m.movement_type).toLowerCase() !== 'restock' || !(Number(m.quantity_change) > 0)) {
    throw new Error('This is not a receipt that can be edited.');
  }
  const lock = lockReason(m, editor);
  if (lock) throw new Error(lock);

  const oldQty = Number(m.quantity_change);
  const delta = newQty - oldQty;
  if (delta === 0) throw new Error('That is already the received quantity.');

  const productName = displayName((m as any).products);
  const warehouseName = (m as any).warehouses?.name || 'the warehouse';
  const confirmed = isConfirmedReason(m.reason);

  // 1. The purchase line first - the only step that can fail on a constraint,
  // so a rejection leaves stock and the ledger untouched.
  let reopenedRemaining = 0;
  if (m.po_item_id) {
    const { data: line, error: lineErr } = await supabase
      .from('purchase_order_items')
      .select('id, po_id, expected_qty, received_qty, purchase_orders!inner(notes, created_at)')
      .eq('id', m.po_item_id)
      .maybeSingle();
    if (lineErr) throw lineErr;

    if (line) {
      const po: any = (line as any).purchase_orders;
      const received = Number(line.received_qty) || 0;
      const expected = Number(line.expected_qty) || 0;
      const newReceived = Math.max(0, received + delta);
      // A purchase auto-created by this very receipt (receiving a to-order line
      // whose cost was known) sits on a PO stamped with the receipt's time, and
      // its "bought" is just the staff count echoed back - so it follows the
      // count. Once an admin has checked it against the supplier's receipt, the
      // bought qty is theirs and stays.
      const autoRecorded = po?.notes !== 'STAFF_DRAFT'
        && Math.abs(new Date(po?.created_at).getTime() - new Date(m.timestamp).getTime()) < 2000
        && !confirmed;

      if (autoRecorded && newReceived === 0) {
        // Nothing arrived after all: drop the made-up purchase. Customers still
        // waiting show up again through negative stock on Need to Buy.
        await supabase.from('procurement_request_sources').delete().eq('purchase_order_item_id', line.id);
        const { error: delErr } = await supabase.from('purchase_order_items').delete().eq('id', line.id);
        if (delErr) throw delErr;
        const { count } = await supabase
          .from('purchase_order_items')
          .select('id', { count: 'exact', head: true })
          .eq('po_id', line.po_id);
        if (!count) await supabase.from('purchase_orders').delete().eq('id', line.po_id);
      } else {
        const newExpected = autoRecorded ? Math.max(newReceived, expected + delta) : expected;
        const status = newReceived >= newExpected ? 'received' : 'pending_receipt';
        const { error: updErr } = await supabase
          .from('purchase_order_items')
          .update({ received_qty: newReceived, expected_qty: newExpected, status })
          .eq('id', line.id);
        if (updErr) throw updErr;
        reopenedRemaining = status === 'pending_receipt' ? newExpected - newReceived : 0;
      }
    }
  }

  // 2. Stock, in the warehouse the receipt went into. Allowed to go negative:
  // stock_level is net of reservations, so below zero just means orders are
  // waiting for units that never arrived (and Need to Buy picks that up).
  const { data: whStock, error: stockErr } = await supabase.rpc('increment_warehouse_stock', {
    p_product_id: m.product_id,
    p_warehouse_id: m.warehouse_id,
    p_qty: delta,
    p_new_unit_cost: null,
  });
  if (stockErr) throw stockErr;

  // 3. The receipt itself now says what actually arrived.
  if (newQty === 0) {
    const { error: delErr } = await supabase.from('inventory_movements').delete().eq('id', m.id);
    if (delErr) throw delErr;
  } else {
    const { error: updErr } = await supabase
      .from('inventory_movements')
      .update({ quantity_change: newQty })
      .eq('id', m.id);
    if (updErr) throw updErr;
  }

  // 4. The trail: a visible zero-quantity note in the movement log + audit row.
  const verb = newQty === 0 ? 'Receipt undone' : 'Receipt corrected';
  const text = `${verb}: ${oldQty} → ${newQty} pcs by ${editor.name}`
    + ` (received ${phtTime(m.timestamp)}${m.performed_by_name && m.performed_by_name !== editor.name ? ` by ${m.performed_by_name}` : ''} into ${warehouseName})`
    + (note ? ` — ${note}` : '');
  await insertLinkedMovement(supabase, {
    product_id: m.product_id,
    quantity_change: 0,
    movement_type: CORRECTION_TYPE,
    timestamp: new Date().toISOString(),
    reason: text,
    unit_cost: 0,
  }, {
    corrects_movement_id: newQty === 0 ? null : m.id,
    po_item_id: m.po_item_id,
    warehouse_id: m.warehouse_id,
    performed_by_id: editor.id,
    performed_by_name: editor.name,
  });

  const { error: auditErr } = await supabase.from('audit_logs').insert({
    table_name: 'inventory_movements',
    record_id: m.id,
    user_id: editor.id,
    user_email: editor.email || 'Unknown',
    action: newQty === 0 ? 'DELETE' : 'UPDATE',
    old_values: { quantity_change: oldQty, reason: m.reason },
    new_values: { quantity_change: newQty, note: note || null, source: 'Receive → Received today' },
  });
  if (auditErr) console.error('Receipt correction audit log failed:', auditErr.message);

  // 5. Staff corrections are told to the admins, who may already have matched
  // this receipt against the supplier's.
  if (!editor.isManagement) {
    try {
      const recipients = resolveRecipientNames(await getAdminAndInventoryLeadNames(supabase), editor.name);
      await fanOutStaffNotifications(supabase, recipients, {
        senderName: editor.name,
        title: `${verb} by ${editor.name}`,
        message: `${productName}: ${oldQty} → ${newQty} pcs${note ? ` — ${note}` : ''}`,
        link: '/dashboard/inventory/receive',
      });
    } catch (notifyErr: any) {
      console.error('Receipt correction notification failed:', notifyErr?.message || notifyErr);
    }
  }

  const { data: product } = await supabase.from('products').select('stock_level').eq('id', m.product_id).single();

  return {
    oldQty,
    newQty,
    stockAfter: Number(product?.stock_level ?? whStock) || 0,
    reopenedRemaining,
  };
}
