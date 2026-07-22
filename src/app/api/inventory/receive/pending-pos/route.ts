import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStaffMessage, getAdminAndInventoryLeadNames, fanOutStaffNotifications, resolveRecipientNames } from '@/lib/services/staff-message-service';
import { getAffectedSalesRepOrders } from '@/lib/services/procurement-service';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data: items, error } = await supabase
      .from('purchase_order_items')
      .select(`
        id, expected_qty, received_qty,
        products (name, variant_name),
        purchase_orders!inner(notes, created_at)
      `)
      .eq('status', 'pending_receipt')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Do not filter out STAFF_DRAFT so that inventory can receive them
    // even if management hasn't finalized the amount/qty.
    // Also, filter out any items that are already fully received but somehow stuck in pending_receipt status.
    const filteredItems = items.filter((i: any) => Math.max(0, i.expected_qty - (i.received_qty || 0)) > 0);

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

    const mapped = filteredItems.map((i: any) => {
      const notes = i.purchase_orders?.notes;
      const boughtAt = i.purchase_orders?.created_at ? new Date(i.purchase_orders.created_at) : null;

      let batchName: string;
      let batchSortKey: string;
      if (notes === 'STAFF_DRAFT') {
        batchName = 'Pending Staff Requests';
        batchSortKey = STAFF_REQUEST_SORT_KEY;
      } else if (notes) {
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
        productName: (i.products.variant_name && !i.products.name.includes(i.products.variant_name)) ? `${i.products.name} [${i.products.variant_name}]` : i.products.name,
        expectedQty: i.expected_qty,
        alreadyReceivedQty: i.received_qty || 0,
        remainingQty: Math.max(0, i.expected_qty - (i.received_qty || 0)),
        batchName,
        batchSortKey,
      };
    });

    // Most recent buying day first, then alphabetical within it. Staff requests
    // sort last - they are the not-yet-bought backlog, not a delivery.
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
    const { receives, unexpectedItems, reportedByName } = await req.json();

    if ((!receives || receives.length === 0) && (!unexpectedItems || unexpectedItems.length === 0)) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

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
          .select('po_id, product_id, unit_cost, expected_qty, received_qty')
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

        // 3. Update Live Stock safely
        const { error: updateError } = await supabase.rpc('increment_stock', {
            p_product_id: poItem.product_id,
            qty: r.receivedQty,
            new_unit_cost: poItem.unit_cost || 0
        });
        
        if (updateError) throw updateError;

        let reason = 'Received from PO';
        if (r.discrepancyReason) {
            reason = `Discrepancy reported: ${r.discrepancyReason} (Received ${r.receivedQty} out of ${poItem.expected_qty - (poItem.received_qty || 0)} remaining)`;
        }

        // 4. Log Movement
        await supabase
          .from('inventory_movements')
          .insert({
            product_id: poItem.product_id,
            quantity_change: r.receivedQty,
            movement_type: 'RESTOCK',
            unit_cost: poItem.unit_cost,
            reason: reason
          });

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
      }
    }

    if (unexpectedItems && unexpectedItems.length > 0) {
      for (const item of unexpectedItems) {
        // 1. Update Live Stock safely
        const { error: updateError } = await supabase.rpc('increment_stock', {
            p_product_id: item.productId,
            qty: item.receivedQty,
            new_unit_cost: item.unitCost || 0
        });
        
        if (updateError) throw updateError;

        // 2. Log Movement
        await supabase
          .from('inventory_movements')
          .insert({
            product_id: item.productId,
            quantity_change: item.receivedQty,
            movement_type: 'RESTOCK',
            unit_cost: item.unitCost || 0,
            reason: 'Unexpected Delivery Item'
          });

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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error processing PO receipts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
