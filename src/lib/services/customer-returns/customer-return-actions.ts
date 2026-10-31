import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerReturnAction } from '@/types/customer-returns.types';
import { CR_OUTCOME_LABELS, CR_OUTCOME_TODO, CR_SHIPPING_PAYER_LABELS } from '@/types/customer-returns.types';
import {
  computeStage,
  CustomerReturnError,
  logEvent,
  notifyNames,
  notifyOwners,
  outcomeCanRunNow,
  setOrderStatus,
  shortOrder,
} from './customer-return-service';
import { createReplacementOrder, giveStoreCredit, recordRefund } from './customer-return-money';

/*
 * Moving a customer return case along. See customer-return-service.ts for the
 * stock rules. Every update is conditional on the row's updated_at, so a
 * double-tap (or two people at once) applies once.
 */

const OWNER_ACTIONS = new Set(['decide', 'damaged_action', 'cancel_case', 'refund_sent', 'credit_given']);

async function loadCase(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('customer_returns')
    .select('*, customer_return_items(*), orders!customer_returns_order_id_fkey(status, sales_person_name, customers(full_name))')
    .eq('id', id)
    .single();
  if (error || !data) throw new CustomerReturnError('Return case not found.');
  return data as any;
}

async function guardedUpdate(supabase: SupabaseClient, r: any, patch: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('customer_returns')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', r.id)
    .eq('updated_at', r.updated_at)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new CustomerReturnError('Someone else just changed this case. Refresh and try again.');
}

/** Puts good pieces back on the shelf (bundles go back as their parts). */
async function restockPiece(supabase: SupabaseClient, productId: string, qty: number, reason: string, actorName: string) {
  const { data: product } = await supabase.from('products').select('name, assembly_recipe').eq('id', productId).maybeSingle();
  const recipe: any[] = Array.isArray(product?.assembly_recipe) ? product!.assembly_recipe : [];
  const targets = recipe.length > 0
    ? recipe.map((c) => ({ id: c.productId || c.component_id, qty: qty * (Number(c.quantity) || 1) })).filter((t) => t.id)
    : [{ id: productId, qty }];
  for (const t of targets) {
    const { error } = await supabase.rpc('increment_stock', { p_product_id: t.id, qty: t.qty });
    if (error) throw error;
    const { error: mErr } = await supabase.from('inventory_movements').insert({
      product_id: t.id,
      quantity_change: t.qty,
      movement_type: 'return',
      timestamp: new Date().toISOString(),
      reason: recipe.length > 0 ? `${reason} (bundle: ${product?.name})` : reason,
      performed_by_name: actorName,
    });
    if (mErr) console.error('customer return movement insert failed:', mErr.message);
  }
}

/**
 * Once the pieces are checked and the owners decided (and it isn't a re-ship,
 * where the pieces stay with the order), good pieces go back on the shelf.
 * restocked_at is claimed first, so this can only happen once.
 */
async function settleGoodPieces(supabase: SupabaseClient, id: string, actorName: string) {
  const r = await loadCase(supabase, id);
  if (!r.checked_at || !r.decided_at || r.restocked_at || r.outcome === 'reship') return;
  const items: any[] = (r.customer_return_items || []).filter((i: any) => i.good_qty > 0 && i.product_id);
  const { data: claimed } = await supabase
    .from('customer_returns')
    .update({ restocked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', r.id)
    .is('restocked_at', null)
    .select('id');
  if (!claimed || claimed.length === 0) return;
  for (const i of items) {
    await restockPiece(supabase, i.product_id, i.good_qty,
      `Customer return #${r.case_no}: good piece back on shelf (order #${shortOrder(r.order_id)})`, actorName);
  }
  if (items.length > 0) {
    await logEvent(supabase, r.id, 'restocked', actorName,
      items.map((i) => `${i.good_qty}× ${i.product_name}`).join(', '));
  }
}

/** Closes the case when nothing is left to do. */
async function closeIfDone(supabase: SupabaseClient, id: string, actorName: string) {
  const r = await loadCase(supabase, id);
  if (r.status === 'closed') return;
  if (computeStage(r, r.customer_return_items || []) !== 'done') return;
  await supabase.from('customer_returns')
    .update({ status: 'closed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', r.id).eq('status', 'open');
  await logEvent(supabase, r.id, 'closed', actorName);
}

export async function applyCustomerReturnAction(
  supabase: SupabaseClient,
  a: CustomerReturnAction,
  actorName: string,
  isManagement: boolean
) {
  if (OWNER_ACTIONS.has(a.action) && !isManagement) throw new CustomerReturnError('Only the owners can do this.');
  const r = await loadCase(supabase, a.id);
  if (r.status === 'closed') throw new CustomerReturnError('This case is already closed.');
  const items: any[] = r.customer_return_items || [];
  const now = new Date().toISOString();

  switch (a.action) {
    case 'decide': {
      if (r.outcome_done_at || r.restocked_at || r.replacement_order_id) throw new CustomerReturnError('This case is already being carried out; the decision can no longer change.');
      if (!CR_OUTCOME_LABELS[a.outcome]) throw new CustomerReturnError('Pick what the customer gets.');
      // RTS parcels and shipped-back items come back anyway; a partial refund means the customer keeps it.
      const askBack = r.source !== 'damage_report' ? true : a.outcome === 'partial_refund' ? false : !!a.askBack;
      if (a.outcome === 'reship' && !askBack) throw new CustomerReturnError('Re-ship needs the parcel back first.');
      const amount = Math.max(0, Number(a.amount) || 0);
      if (['partial_refund', 'store_credit'].includes(a.outcome) && !(amount > 0)) throw new CustomerReturnError('Enter the amount.');
      const shippingPayer = a.outcome === 'replacement' || a.outcome === 'reship' ? a.shippingPayer || null : null;
      if (a.outcome === 'replacement' && !shippingPayer) throw new CustomerReturnError('Pick who pays shipping on the replacement.');
      await guardedUpdate(supabase, r, {
        outcome: a.outcome,
        ask_back: askBack,
        replacement_timing: askBack && a.outcome !== 'reship' && CR_OUTCOME_TODO[a.outcome] ? (a.replacementTiming || 'after_arrival') : null,
        amount,
        courier_claim: !!a.courierClaim,
        shipping_payer: shippingPayer,
        decision_note: a.note?.trim() || null,
        decided_at: now,
        decided_by_name: actorName,
      });
      if (!askBack) {
        // Not coming back: the customer keeps or throws the pieces.
        for (const i of items) {
          await supabase.from('customer_return_items')
            .update({ good_qty: 0, damaged_qty: i.qty, damaged_action: 'never_came_back' }).eq('id', i.id);
        }
      }
      if (a.outcome === 'cancel_order' && r.orders?.status !== 'Returned') await setOrderStatus(supabase, r.order_id, 'Returned', actorName);
      const summary = `${CR_OUTCOME_LABELS[a.outcome]}${amount ? ` ₱${amount.toLocaleString('en-PH')}` : ''}${askBack ? '' : ', not asking for it back'}${shippingPayer && a.outcome === 'replacement' ? `, ${CR_SHIPPING_PAYER_LABELS[shippingPayer].toLowerCase()}` : ''}`;
      await logEvent(supabase, r.id, 'decided', actorName, [summary, a.courierClaim ? 'claim from courier' : '', a.note?.trim()].filter(Boolean).join(' · '));
      const agent = r.orders?.sales_person_name;
      if (agent && agent.trim().toLowerCase() !== actorName.trim().toLowerCase()) {
        await notifyNames(supabase, [agent], `Return #${r.case_no}: owner decided`,
          `#${shortOrder(r.order_id)} ${r.orders?.customers?.full_name || 'Customer'}: ${summary}. Please tell the customer.`);
      }
      break;
    }
    case 'arrived': {
      if (!r.ask_back) throw new CustomerReturnError('The owners did not ask for this item back.');
      if (r.arrived_at) throw new CustomerReturnError('Already marked as arrived.');
      await guardedUpdate(supabase, r, { arrived_at: now, arrived_by_name: actorName });
      await logEvent(supabase, r.id, 'arrived', actorName);
      break;
    }
    case 'check': {
      if (!r.ask_back) throw new CustomerReturnError('Nothing is coming back on this case.');
      if (r.checked_at) throw new CustomerReturnError('Already checked.');
      const byId = new Map((a.items || []).map((i) => [i.id, i]));
      for (const i of items) {
        const c = byId.get(i.id);
        const good = Math.round(Number(c?.goodQty) || 0);
        const bad = Math.round(Number(c?.damagedQty) || 0);
        if (good < 0 || bad < 0 || good + bad !== i.qty) {
          throw new CustomerReturnError(`${i.product_name}: Good + Damaged must add up to ${i.qty}. Count each piece once.`);
        }
      }
      await guardedUpdate(supabase, r, {
        checked_at: now, checked_by_name: actorName,
        ...(r.arrived_at ? {} : { arrived_at: now, arrived_by_name: actorName }),
      });
      for (const i of items) {
        const c = byId.get(i.id)!;
        await supabase.from('customer_return_items')
          .update({ good_qty: Math.round(c.goodQty), damaged_qty: Math.round(c.damagedQty) }).eq('id', i.id);
      }
      const damaged = items.filter((i) => (byId.get(i.id)?.damagedQty || 0) > 0);
      const text = items.map((i) => {
        const c = byId.get(i.id)!;
        return `${i.product_name}: ${c.goodQty} good${c.damagedQty ? `, ${c.damagedQty} damaged` : ''}`;
      }).join('; ');
      await logEvent(supabase, r.id, 'checked', actorName, [text, a.note?.trim()].filter(Boolean).join(' · '));
      if (damaged.length > 0) {
        await notifyOwners(supabase, `Return #${r.case_no}: damaged pieces`,
          `#${shortOrder(r.order_id)}: ${damaged.map((i) => `${byId.get(i.id)!.damagedQty}× ${i.product_name}`).join(', ')}. Throw away or sell as 2nd-hand?`, actorName);
      }
      break;
    }
    case 'damaged_action': {
      const item = items.find((i) => i.id === a.itemId);
      if (!item || !(item.damaged_qty > 0)) throw new CustomerReturnError('No damaged pieces on that line.');
      if (!['throw_away', 'second_hand'].includes(a.damagedAction)) throw new CustomerReturnError('Pick throw away or 2nd-hand.');
      await supabase.from('customer_return_items').update({ damaged_action: a.damagedAction }).eq('id', item.id);
      await guardedUpdate(supabase, r, {});
      await logEvent(supabase, r.id, a.damagedAction, actorName, `${item.damaged_qty}× ${item.product_name}`);
      break;
    }
    case 'outcome_done': {
      const todo = r.outcome ? CR_OUTCOME_TODO[r.outcome as keyof typeof CR_OUTCOME_TODO] : null;
      if (!r.decided_at || !todo) throw new CustomerReturnError('Nothing to carry out on this case.');
      // Replacements, refunds and credit have their own steps (they make an order or a money entry).
      if (r.outcome !== 'reship') throw new CustomerReturnError('Use the button for this step on the case.');
      if (todo.ownerOnly && !isManagement) throw new CustomerReturnError('Only the owners can do this.');
      if (r.outcome_done_at) throw new CustomerReturnError('Already done.');
      if (!outcomeCanRunNow(r)) throw new CustomerReturnError('Wait for the item to arrive and be checked first.');
      await guardedUpdate(supabase, r, { outcome_done_at: now, outcome_done_by_name: actorName, outcome_done_note: a.note?.trim() || null });
      if (r.outcome === 'reship') await setOrderStatus(supabase, r.order_id, 'For Shipping', actorName);
      await logEvent(supabase, r.id, 'outcome_done', actorName, [todo.label, a.note?.trim()].filter(Boolean).join(' · '));
      break;
    }
    case 'replacement_order': {
      await createReplacementOrder(supabase, r, a.items || [], actorName, a.note);
      break;
    }
    case 'refund_sent': {
      await recordRefund(supabase, r, a, actorName);
      break;
    }
    case 'credit_given': {
      await giveStoreCredit(supabase, r, a, actorName);
      break;
    }
    case 'add_photos': {
      const urls = (a.photoUrls || []).filter((u) => typeof u === 'string' && u.startsWith('http'));
      if (urls.length === 0) return;
      await guardedUpdate(supabase, r, { photo_urls: [...(r.photo_urls || []), ...urls].slice(0, 20) });
      await logEvent(supabase, r.id, 'photos', actorName, `${urls.length} photo(s)`);
      return;
    }
    case 'cancel_case': {
      if (r.restocked_at || r.outcome_done_at || r.replacement_order_id) throw new CustomerReturnError('Already carried out; it can no longer be cancelled.');
      await guardedUpdate(supabase, r, { status: 'closed', closed_at: now });
      await logEvent(supabase, r.id, 'cancelled', actorName, a.note?.trim());
      return;
    }
    default:
      throw new CustomerReturnError('Unknown action.');
  }

  await settleGoodPieces(supabase, r.id, actorName);
  await closeIfDone(supabase, r.id, actorName);
}
