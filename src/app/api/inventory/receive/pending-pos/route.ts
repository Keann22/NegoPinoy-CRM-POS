import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStaffMessage, getAdminAndInventoryLeadNames, fanOutStaffNotifications, resolveRecipientNames } from '@/lib/services/staff-message-service';
import { getAffectedSalesRepOrders } from '@/lib/services/procurement-service';
import { suggestSupplierAndCost, repairFromPurchaseItem } from '@/lib/services/purchase-repair-service';
import { formatShortDelivery } from '@/lib/utils/messages';
import { findStage, PHASE_LABELS, transitStatus } from '@/lib/online-order-tracking';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { insertLinkedMovement, editorFromUser } from '@/lib/services/receipt-correction-service';
import { checkReceiptGate, logReceiptOverrides } from '@/lib/services/receipt-gate-service';
import { getRecentPickerCounts } from '@/lib/services/inventory/picker-shelf-guard-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Where an online order is, for staff waiting on it. Status only - no
// platform, order number, supplier or cost (those are management-only).
function shippingFor(po: any) {
  const stage = findStage(po?.tracking_route, po?.tracking_stage);
  if (!stage) return null;
  return {
    phase: PHASE_LABELS[stage.phase],
    stage: stage.label,
    status: transitStatus({ stage: stage.key, expectedArrival: po.expected_arrival, orderedAt: po.created_at }),
    expectedArrival: po.expected_arrival || null,
  };
}

export async function GET() {
  try {
    const { data: items, error } = await supabase
      .from('purchase_order_items')
      .select(`
        id, product_id, expected_qty, received_qty,
        products (name, variant_name),
        purchase_orders!inner(notes, created_at, tracking_route, tracking_stage, expected_arrival)
      `)
      .eq('status', 'pending_receipt')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Only what the owners recorded as bought. STAFF_DRAFT lines are staff
    // procurement requests - the shopping list, not deliveries - so they stay on
    // the Procurement Sheet / Priority List. Receiving them here used to let
    // stock in with no purchase recorded (receipt-first receiving).
    // Also skip lines already fully received but stuck in pending_receipt.
    const filteredItems = items.filter((i: any) =>
      i.purchase_orders?.notes !== 'STAFF_DRAFT' && Math.max(0, i.expected_qty - (i.received_qty || 0)) > 0);

    // Buying days are the unit staff actually receive against: management taps
    // Buy item by item, so each purchase gets its own PO with no notes. Grouping
    // those by the day they were bought turns a pile of anonymous rows into the
    // batch that physically arrives together. Deliberately no supplier anywhere
    // in this payload - buying sources are management-only.
    const phtDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
    const phtLabel = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
    });
    const STAFF_REQUEST_SORT_KEY = '0000-00-00';
    // A picker count in the last 2 days may already include pieces from this delivery.
    const pickerCounts = await getRecentPickerCounts(supabase, Array.from(new Set(filteredItems.map((i: any) => i.product_id))));

    const mapped = filteredItems.map((i: any) => {
      const notes = i.purchase_orders?.notes;
      const boughtAt = i.purchase_orders?.created_at ? new Date(i.purchase_orders.created_at) : null;

      let batchName: string;
      let batchSortKey: string;
      if (notes) {
        batchName = notes;
        batchSortKey = boughtAt ? phtDay.format(boughtAt) : STAFF_REQUEST_SORT_KEY;
      } else if (boughtAt) {
        batchName = `Purchases — ${phtLabel.format(boughtAt)}`;
        batchSortKey = phtDay.format(boughtAt);
      } else {
        batchName = 'Unknown Batch';
        batchSortKey = STAFF_REQUEST_SORT_KEY;
      }

      return {
        id: i.id,
        productId: i.product_id,
        productName: (i.products.variant_name && !i.products.name.includes(i.products.variant_name)) ? `${i.products.name} [${i.products.variant_name}]` : i.products.name,
        expectedQty: i.expected_qty,
        alreadyReceivedQty: i.received_qty || 0,
        remainingQty: Math.max(0, i.expected_qty - (i.received_qty || 0)),
        batchName,
        batchSortKey,
        shipping: shippingFor(i.purchase_orders),
        pickerCount: pickerCounts.get(i.product_id) || null,
      };
    });

    // Most recent buying day first, then alphabetical within it.
    mapped.sort((a, b) =>
      b.batchSortKey.localeCompare(a.batchSortKey) || a.productName.localeCompare(b.productName));

    return NextResponse.json({ pendingItems: mapped });
  } catch (error: any) {
    console.error('Error fetching pending POs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { receives, unexpectedItems, reportedByName, targetWarehouseId: reqTargetWarehouseId, overrideReason } = await req.json();

    if ((!receives || receives.length === 0) && (!unexpectedItems || unexpectedItems.length === 0)) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    let targetWarehouseId = reqTargetWarehouseId;
    if (!targetWarehouseId) {
      const { data: u2 } = await supabase.from('warehouses').select('id').eq('code', 'UNIT2').maybeSingle();
      if (u2) targetWarehouseId = u2.id;
    }

    // Who received it and where, so the receipt can be corrected later from
    // "Received today" (the person, same day, or an admin). Taken from the
    // session, not the request body.
    const sessionClient = await createSessionClient();
    const { data: { user: sessionUser } } = await sessionClient.auth.getUser();
    const editor = editorFromUser(sessionUser);
    // Receipt-first: staff requests and unexpected items need a recorded
    // purchase, or an admin override with a reason. Checked before any write.
    const gate = await checkReceiptGate(supabase, {
      receives: receives || [],
      unexpectedItems: unexpectedItems || [],
      editor,
      overrideReason,
    });
    if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const receiptLinks = {
      warehouse_id: targetWarehouseId || null,
      performed_by_id: editor?.id || null,
      performed_by_name: reportedByName || editor?.name || null,
    };

    // Fetched lazily (only if at least one item actually has a discrepancy) and
    // cached across the loop so multiple discrepant items in one submission
    // don't each re-fetch the same admin/lead list.
    let escalationRecipients: string[] | null = null;
    const getEscalationRecipients = async (): Promise<string[]> => {
      if (!escalationRecipients) {
        escalationRecipients = resolveRecipientNames(
          await getAdminAndInventoryLeadNames(supabase),
          reportedByName || 'Inventory Staff'
        );
      }
      return escalationRecipients;
    };

    if (receives && receives.length > 0) {
      for (const r of receives) {
        // 1. Get PO item
        const { data: poItem, error: poErr } = await supabase
          .from('purchase_order_items')
          .select('po_id, product_id, supplier_id, unit_cost, expected_qty, received_qty')
          .eq('id', r.itemId)
          .single();

        if (poErr) throw poErr;

        const newReceivedQty = (poItem.received_qty || 0) + r.receivedQty;
        const newStatus = newReceivedQty >= poItem.expected_qty ? 'received' : 'pending_receipt';

        // 2. Mark PO item
        const { error: updErr } = await supabase
          .from('purchase_order_items')
          .update({ received_qty: newReceivedQty, status: newStatus })
          .eq('id', r.itemId);

        if (updErr) throw updErr;

        // A to-order line received straight off the staff sheet arrives with no
        // supplier and no cost. If we already know both from history, record the
        // purchase properly below instead of banking the stock at ₱0 and leaving
        // it for someone to fix by hand in the Purchases Report.
        const lineMissing = !poItem.supplier_id || !(Number(poItem.unit_cost) > 0);
        const suggestion = lineMissing
          ? await suggestSupplierAndCost(supabase, poItem.product_id, poItem.unit_cost, poItem.supplier_id)
          : { supplierId: poItem.supplier_id, supplierName: null, unitCost: Number(poItem.unit_cost) || 0, source: 'already on this receipt' };
        const canAutoRecord = lineMissing && suggestion.unitCost > 0 && !!suggestion.supplierId;

        // 3. Update Live Stock safely. Value it at the best cost we have; pass
        // null (not 0) when unknown so increment_stock's coalesce keeps the
        // product's existing cost rather than clobbering it to zero. When we're
        // about to auto-record, leave the cost to the repair step (which also
        // amends the ledger entry below) and just move the units.
        const stockCost = canAutoRecord
          ? null
          : (Number(poItem.unit_cost) > 0 ? Number(poItem.unit_cost) : null);
        const { error: updateError } = targetWarehouseId
          ? await supabase.rpc('increment_warehouse_stock', {
              p_product_id: poItem.product_id,
              p_warehouse_id: targetWarehouseId,
              p_qty: r.receivedQty,
              p_new_unit_cost: stockCost,
            })
          : await supabase.rpc('increment_stock', {
              p_product_id: poItem.product_id,
              qty: r.receivedQty,
              new_unit_cost: stockCost,
            });

        if (updateError) throw updateError;

        let reason = 'Received from PO';
        if (r.discrepancyReason) {
            reason = formatShortDelivery({
              note: r.discrepancyReason,
              receivedNow: r.receivedQty,
              orderedTotal: poItem.expected_qty,
              receivedEarlier: poItem.received_qty || 0,
            });
        }

        // 4. Log Movement. Booked uncosted when auto-recording so the repair step
        // can find this exact receipt and stamp the cost/supplier onto it.
        // Not fatal (as before): stock has already moved, and a 500 here would
        // invite a retry that receives the same units twice.
        await insertLinkedMovement(supabase, {
          product_id: poItem.product_id,
          quantity_change: r.receivedQty,
          movement_type: 'RESTOCK',
          unit_cost: canAutoRecord ? 0 : poItem.unit_cost,
          reason: reason
        }, { ...receiptLinks, po_item_id: r.itemId })
          .catch((mvErr: any) => console.error('Receipt movement insert failed:', mvErr?.message || mvErr));

        // 5. Raise an urgent purchase issue for the Inbox when fewer items arrived than expected
        if (r.discrepancyReason) {
          const recipientNames = await getEscalationRecipients();

          const { data: purchaseIssue, error: issueErr } = await supabase
            .from('order_issues')
            .insert({
              issue_type: 'purchase_discrepancy',
              po_id: poItem.po_id,
              product_id: poItem.product_id,
              status: 'open',
              reported_by_name: reportedByName || 'Inventory Staff'
            })
            .select('id')
            .single();

          if (issueErr) {
            console.error('Error creating purchase issue:', issueErr);
          } else {
            await supabase
              .from('order_issue_messages')
              .insert({
                issue_id: purchaseIssue.id,
                sender_role: 'inventory',
                sender_name: reportedByName || 'Inventory Staff',
                message: reason,
                requires_attention: true,
                mentions: recipientNames
              });

            // Actually ping Admin/Inventory leads via the Bell — previously this
            // only created the Inbox Drawer thread with empty mentions, so
            // nobody was notified unless they happened to be online at that moment.
            await fanOutStaffNotifications(supabase, recipientNames, {
              senderName: reportedByName || 'Inventory Staff',
              message: reason,
            });
          }

          // 6. Separately, create a product-issue thread pinged to whoever's order
          // actually depends on this shortage — a distinct, customer-order-facing
          // message (not the PO/batch-oriented purchase_discrepancy thread above,
          // which is purchasing-ops internal) so the sales rep sees something
          // relevant to them rather than PO batch details they don't need.
          const repOrders = await getAffectedSalesRepOrders(supabase, poItem.product_id);
          const affectedSalesReps = resolveRecipientNames(
            Array.from(repOrders.keys()),
            reportedByName || 'Inventory Staff'
          );
          if (affectedSalesReps.length > 0) {
            await createStaffMessage(supabase, {
              issueType: 'product',
              productId: poItem.product_id,
              message: reason,
              senderName: reportedByName || 'Inventory Staff',
              senderRole: 'inventory',
              recipientNames: affectedSalesReps,
              // Link each rep's notification to their own affected order so the
              // Bell can pop the order card for it
              linkByRecipient: new Map(
                Array.from(repOrders, ([name, orderIdForRep]) => [name, `/dashboard/orders/${orderIdForRep}`])
              ),
            });
          }
        }

        // Auto-resolve any open procurement issues for this product
        const { data: issues } = await supabase
          .from('procurement_issues')
          .select('id')
          .eq('product_id', poItem.product_id)
          .eq('status', 'open');

        if (issues && issues.length > 0) {
          for (const issue of issues) {
            await supabase
              .from('procurement_issues')
              .update({ status: 'resolved' })
              .eq('id', issue.id);

            await supabase
              .from('procurement_issue_messages')
              .insert({
                issue_id: issue.id,
                sender_role: 'system',
                sender_name: 'System',
                message: 'Issue automatically resolved because the item was accepted into inventory.'
              });
          }
        }

        // 7. Auto-record the purchase when history told us the supplier and cost.
        // repairFromPurchaseItem is exactly what the Purchases Report "Save"
        // button runs: it amends the uncosted receipt movement booked above,
        // sets the product cost, moves a STAFF_DRAFT line onto a real dated PO,
        // aligns its expected qty, and backfills COGS onto waiting orders — so
        // the item stops surfacing as "missing a supplier or cost". Quantity is
        // left untouched (already applied in steps 2–3). Failure here must not
        // undo the receipt, so it's best-effort and logged.
        if (canAutoRecord) {
          try {
            await repairFromPurchaseItem(supabase, r.itemId, suggestion.supplierId, suggestion.unitCost);
          } catch (autoErr: any) {
            console.error(`Auto-record on receive failed for item ${r.itemId} (left for manual entry):`, autoErr?.message || autoErr);
          }
        }
      }
    }

    if (unexpectedItems && unexpectedItems.length > 0) {
      for (const item of unexpectedItems) {
        // 1. Update Live Stock safely
        const { error: updateError } = targetWarehouseId
          ? await supabase.rpc('increment_warehouse_stock', {
              p_product_id: item.productId,
              p_warehouse_id: targetWarehouseId,
              p_qty: item.receivedQty,
              p_new_unit_cost: item.unitCost || 0,
            })
          : await supabase.rpc('increment_stock', {
              p_product_id: item.productId,
              qty: item.receivedQty,
              new_unit_cost: item.unitCost || 0,
            });
        
        if (updateError) throw updateError;

        // 2. Log Movement
        await insertLinkedMovement(supabase, {
          product_id: item.productId,
          quantity_change: item.receivedQty,
          movement_type: 'RESTOCK',
          unit_cost: item.unitCost || 0,
          reason: 'Unexpected Delivery Item'
        }, receiptLinks)
          .catch((mvErr: any) => console.error('Receipt movement insert failed:', mvErr?.message || mvErr));

        // Auto-resolve any open procurement issues for this product
        const { data: issues } = await supabase
          .from('procurement_issues')
          .select('id')
          .eq('product_id', item.productId)
          .eq('status', 'open');

        if (issues && issues.length > 0) {
          for (const issue of issues) {
            await supabase
              .from('procurement_issues')
              .update({ status: 'resolved' })
              .eq('id', issue.id);

            await supabase
              .from('procurement_issue_messages')
              .insert({
                issue_id: issue.id,
                sender_role: 'system',
                sender_name: 'System',
                message: 'Issue automatically resolved because the item was accepted into inventory.'
              });
          }
        }
      }
    }

    if (editor && overrideReason) {
      await logReceiptOverrides(supabase, editor, overrideReason, [
        ...(receives || []).filter((r: any) => gate.draftIds.has(r.itemId))
          .map((r: any) => ({ table: 'purchase_order_items' as const, id: r.itemId, qty: r.receivedQty })),
        ...(unexpectedItems || []).map((u: any) => ({ table: 'products' as const, id: u.productId, qty: u.receivedQty })),
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error processing PO receipts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
