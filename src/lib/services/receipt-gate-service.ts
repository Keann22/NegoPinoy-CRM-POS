import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Receipt-first receiving.
 *
 * Staff may only receive what the owners have recorded as bought (a real
 * purchase order line: Buy / Scan receipt on the Procurement Sheet, or an
 * online order). Two things have no purchase behind them and are blocked for
 * staff until the receipt is in:
 *  - STAFF_DRAFT lines: to-order requests nobody has recorded as bought yet.
 *  - Unexpected items: goods that arrived with no purchase line at all.
 * Staff message the owners on Facebook instead; admins can override with a reason
 * (urgent orders), and the receipt then still shows as owed on the Received tab.
 */

export const NO_RECEIPT_MESSAGE =
  'This item is not recorded as bought yet. Ask the owners to scan the receipt or record the purchase first.';

type ReceiveLine = { itemId: string };
type GateEditor = { id: string; email: string | null; name: string; isManagement: boolean };

/** PO line ids that are staff requests (STAFF_DRAFT), not recorded purchases. */
export async function staffDraftItemIds(supabase: SupabaseClient, itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('id, purchase_orders!inner(notes)')
    .in('id', itemIds)
    .eq('purchase_orders.notes', 'STAFF_DRAFT');
  if (error) throw error;
  return new Set((data || []).map((d: any) => d.id as string));
}

/**
 * Checked before anything is written, so a blocked line never leaves the rest
 * of the submission half-received.
 */
export async function checkReceiptGate(
  supabase: SupabaseClient,
  { receives, unexpectedItems, editor, overrideReason }: {
    receives: ReceiveLine[];
    unexpectedItems: { productId: string }[];
    editor: GateEditor | null;
    overrideReason?: string;
  }
): Promise<{ error: string; status: number } | { draftIds: Set<string> }> {
  const draftIds = await staffDraftItemIds(supabase, receives.map((r) => r.itemId));
  const needsReceipt = draftIds.size > 0 || unexpectedItems.length > 0;
  if (!needsReceipt) return { draftIds };

  if (!editor?.isManagement) return { error: NO_RECEIPT_MESSAGE, status: 403 };
  if (!overrideReason?.trim()) {
    return { error: 'Receiving without a receipt needs a reason.', status: 400 };
  }
  return { draftIds };
}

/** One audit row per item an admin received without a receipt. */
export async function logReceiptOverrides(
  supabase: SupabaseClient,
  editor: GateEditor,
  reason: string,
  lines: { table: 'purchase_order_items' | 'products'; id: string; qty: number }[]
) {
  if (lines.length === 0) return;
  const { error } = await supabase.from('audit_logs').insert(
    lines.map((l) => ({
      table_name: l.table,
      record_id: l.id,
      user_id: editor.id,
      user_email: editor.email || 'Unknown',
      action: 'INSERT',
      old_values: null,
      new_values: { received_qty: l.qty, override: 'received without receipt', reason: reason.trim(), by: editor.name },
    }))
  );
  if (error) console.error('Receipt override audit log failed:', error.message);
}
