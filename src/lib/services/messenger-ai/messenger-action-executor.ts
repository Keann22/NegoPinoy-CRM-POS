import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderFormValues } from '@/lib/schemas/order';
import { createOrder } from '@/lib/services/orders/order-creation';
import { diffOrderItems } from '@/lib/services/orders/order-change-rules';
import { recordOrderChange } from '@/lib/services/orders/order-change-service';
import { cancelOrder, OrderCancelError } from '@/lib/services/orders/order-cancel-service';
import { editOrder } from '@/lib/services/orders/order-update';
import { setShipHold } from '@/lib/services/shipping/ship-hold-service';
import { addDaysPht, phtToday, shortOrderId } from '@/lib/shipping/ship-hold-rules';
import type {
  CopilotActionPayload,
  MessengerAiAction,
  OrderCancelPayload,
  OrderEditItemsPayload,
  ShipHoldPayload,
} from '@/types';
import { CopilotError } from './messenger-context-builder';
import { applyPaymentPromise, applyPaymentProof } from './messenger-payment-executor';
import {
  applyBusShippingRequest,
  applyDamageOrComplaint,
  applyDeliveryOrOrderNote,
  applyWaitingPromptReply,
} from './messenger-phase2-executor';

export interface ExecutorCaller {
  id: string;
  name: string;
  isManagement?: boolean;
  /** Sales or owners; needed to cancel an order. */
  canCancel?: boolean;
}

const VALID_PAY_TYPES = new Set(['Full Payment', 'Lay-away', 'Installment', 'COD', 'Pending']);

async function assertVariantsOnly(supabase: SupabaseClient, productIds: string[]) {
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  if (unique.length === 0) return;
  const { data, error } = await supabase.from('products').select('parent_id').in('parent_id', unique).limit(1);
  if (error) throw error;
  if (data && data.length > 0) {
    throw new CopilotError('One of the items is a main product. Click Edit and pick the exact color/size variant first.');
  }
}

async function loadProductPricesAndCosts(supabase: SupabaseClient, productIds: string[]) {
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  const map = new Map<string, { name: string; sellingPrice: number; costPrice: number }>();
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from('products')
    .select('id, name, selling_price, sale_price, is_on_sale, initial_unit_cost')
    .in('id', unique);
  if (error) throw error;
  for (const r of data ?? []) {
    map.set(String(r.id), {
      name: String(r.name),
      sellingPrice: Number(r.is_on_sale && r.sale_price ? r.sale_price : r.selling_price || 0),
      costPrice: Number(r.initial_unit_cost || 0),
    });
  }
  return map;
}

async function applyOrderEditOrCreate(
  supabase: SupabaseClient,
  action: MessengerAiAction,
  payload: OrderEditItemsPayload,
  caller: ExecutorCaller
): Promise<string> {
  if (payload.items.length === 0) throw new CopilotError('No item changes specified. Click Edit to choose items.');
  const touchedIds = payload.items.flatMap((i) => [i.productId || '', i.replaceProductId || '']).filter(Boolean);
  if (payload.items.some((i) => i.op !== 'remove' && !i.productId)) {
    throw new CopilotError('An item is missing its exact product variant. Click Edit to pick the variant.');
  }
  await assertVariantsOnly(supabase, touchedIds);
  const catalogMap = await loadProductPricesAndCosts(supabase, touchedIds);

  if (payload.createNewOrder) {
    if (!action.customerId) throw new CopilotError('Link this Messenger chat to a customer account before creating an order.');
    const { data: cust } = await supabase
      .from('customers')
      .select('full_name, mobile_number, address_line, city, province')
      .eq('id', action.customerId)
      .single();
    const orderItems = payload.items
      .filter((i) => i.op !== 'remove' && i.productId)
      .map((i) => {
        const info = catalogMap.get(i.productId!);
        return {
          productId: i.productId!,
          productName: info?.name || i.productName,
          quantity: Math.max(1, i.quantity),
          costPriceAtSale: info?.costPrice ?? 0,
          sellingPriceAtSale: i.unitPrice && i.unitPrice > 0 ? i.unitPrice : info?.sellingPrice ?? 0,
          discount: 0,
          priceType: 'regular' as const,
        };
      });
    if (orderItems.length === 0) throw new CopilotError('Add at least one item to create a new order.');
    const addr = [cust?.address_line, cust?.city, cust?.province].filter(Boolean).join(', ');
    const values: OrderFormValues = {
      customerId: action.customerId,
      orderDate: new Date(),
      orderItems,
      paymentType: payload.newOrderPaymentType || 'COD',
      orderStatus: 'Processing',
      shippingDetails: [cust?.full_name, cust?.mobile_number, addr].filter(Boolean).join(' • '),
      includeInsurance: true,
      applyOverpayment: false,
      isDownpaymentCOD: false,
      isInstallmentFirstTimer: false,
      amountPaid: 0,
    };
    const newId = await createOrder(supabase, values, {
      userId: caller.id,
      salesPersonId: caller.id,
      salesPersonName: caller.name,
    });
    return `Created new order ${shortOrderId(newId)} (${orderItems.map((i) => `${i.quantity}x ${i.productName}`).join(', ')})`;
  }

  if (!payload.orderId) throw new CopilotError('Select which open order to edit.');
  const { data: ord, error: ordErr } = await supabase
    .from('orders')
    .select('id, customer_id, status, order_date, amount_paid, payment_method, installment_months, monthly_payment, insurance_fee, platform_fees, tracking_number, delivery_instructions, order_items(product_id, product_name, quantity, cost_price_at_sale, selling_price_at_sale, discount, price_type)')
    .eq('id', payload.orderId)
    .single();
  if (ordErr || !ord) throw new CopilotError('Target order not found.');

  const existing = ((ord.order_items ?? []) as Array<Record<string, unknown>>)
    .filter((it) => Boolean(it.product_id))
    .map((it) => ({
      productId: String(it.product_id),
      productName: String(it.product_name || 'Item'),
      quantity: Number(it.quantity || 1),
      costPriceAtSale: Number(it.cost_price_at_sale || 0),
      sellingPriceAtSale: Number(it.selling_price_at_sale || 0),
      discount: Number(it.discount || 0),
      priceType: (it.price_type as OrderFormValues['orderItems'][number]['priceType']) || 'regular',
    }));

  const originalItems = existing.map((i) => ({ ...i }));
  let nextItems = existing.map((i) => ({ ...i }));

  for (const ch of payload.items) {
    if (ch.op === 'remove') {
      nextItems = nextItems.filter((x) => x.productId !== ch.productId);
    } else if (ch.op === 'set_qty' && ch.productId) {
      const hit = nextItems.find((x) => x.productId === ch.productId);
      if (hit) hit.quantity = Math.max(1, ch.quantity);
    } else if ((ch.op === 'swap' || ch.op === 'add') && ch.productId) {
      if (ch.op === 'swap' && ch.replaceProductId) nextItems = nextItems.filter((x) => x.productId !== ch.replaceProductId);
      const info = catalogMap.get(ch.productId);
      const already = nextItems.find((x) => x.productId === ch.productId);
      if (already) already.quantity += Math.max(1, ch.quantity);
      else {
        nextItems.push({
          productId: ch.productId,
          productName: info?.name || ch.productName,
          quantity: Math.max(1, ch.quantity),
          costPriceAtSale: info?.costPrice ?? 0,
          sellingPriceAtSale: ch.unitPrice && ch.unitPrice > 0 ? ch.unitPrice : info?.sellingPrice ?? 0,
          discount: 0,
          priceType: 'regular',
        });
      }
    }
  }

  if (nextItems.length === 0) throw new CopilotError('An order cannot have 0 items. Use Cancel Order instead.');
  const payType = VALID_PAY_TYPES.has(String(ord.payment_method)) ? (String(ord.payment_method) as OrderFormValues['paymentType']) : 'COD';

  await editOrder(
    supabase,
    {
      customerId: String(ord.customer_id),
      orderDate: new Date(String(ord.order_date || new Date().toISOString())),
      orderItems: nextItems,
      paymentType: payType,
      installmentMonths: ord.installment_months ? Number(ord.installment_months) : undefined,
      monthlyPayment: ord.monthly_payment ? Number(ord.monthly_payment) : undefined,
      orderStatus: String(ord.status),
      shippingDetails: ord.delivery_instructions ? String(ord.delivery_instructions) : undefined,
      trackingNumber: ord.tracking_number ? String(ord.tracking_number) : undefined,
      includeInsurance: Number(ord.insurance_fee || 0) > 0,
      applyOverpayment: false,
      platformFees: ord.platform_fees ? Number(ord.platform_fees) : undefined,
      amountPaid: Number(ord.amount_paid || 0),
      isDownpaymentCOD: false,
      isInstallmentFirstTimer: false,
    },
    {
      userProfileId: caller.id,
      userProfileName: caller.name,
      orderId: payload.orderId,
      originalOrderDate: String(ord.order_date || new Date().toISOString()),
      originalAmountPaid: Number(ord.amount_paid || 0),
      originalOrderItems: originalItems,
    }
  );

  const changes = diffOrderItems(
    originalItems.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity })),
    nextItems.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity }))
  );
  if (changes.length > 0) {
    await recordOrderChange(supabase, payload.orderId, changes, caller.name).catch((e) =>
      console.warn('Copilot recordOrderChange skipped:', e)
    );
  }
  return `Updated ${shortOrderId(payload.orderId)} (${changes.map((c) => `${c.name}: ${c.before}→${c.after}`).join(', ') || 'items updated'})`;
}

async function applyShipHold(supabase: SupabaseClient, payload: ShipHoldPayload, caller: ExecutorCaller) {
  if (!payload.orderId) throw new CopilotError('Pick an open order to hold.');
  const checkOn = payload.checkOn >= phtToday() ? payload.checkOn : addDaysPht(1);
  return setShipHold(
    supabase,
    { orderId: payload.orderId, kind: payload.holdKind, shipVia: payload.shipVia, checkOn, withOrderIds: payload.withOrderIds || [], note: payload.note || 'Requested via Messenger' },
    caller.name
  );
}

async function applyOrderCancel(supabase: SupabaseClient, payload: OrderCancelPayload, caller: ExecutorCaller) {
  if (!payload.orderId) throw new CopilotError('Pick which order to cancel.');
  const { data: ord, error } = await supabase
    .from('orders')
    .select('id, status, amount_paid')
    .eq('id', payload.orderId)
    .maybeSingle();
  if (error || !ord) throw new CopilotError('Order not found.');
  if (ord.status === 'Cancelled') return `${shortOrderId(payload.orderId)} was already cancelled`;
  const paid = Number(ord.amount_paid || 0);
  if (paid > 0.009 && caller.isManagement) {
    throw new CopilotError(
      `Order ${shortOrderId(payload.orderId)} has ₱${paid.toLocaleString('en-PH')} paid. Cancel it from the order page to choose store credit or refund.`
    );
  }
  // Same path as every other cancel: guarded status update, stock, put-back task,
  // cleanup triggers, and paid orders from sales go to the owners.
  try {
    const result = await cancelOrder(
      supabase,
      {
        orderId: payload.orderId,
        reason: (payload.reason || '').trim() || 'Customer asked to cancel on Messenger',
        source: 'messenger_ai',
      },
      { id: caller.id, name: caller.name, isManagement: Boolean(caller.isManagement), canCancel: Boolean(caller.canCancel) }
    );
    if (!result.cancelled) return result.outcome;
    return `Cancelled ${shortOrderId(payload.orderId)}`;
  } catch (err) {
    if (err instanceof OrderCancelError) throw new CopilotError(err.message, err.status);
    throw err;
  }
}

export async function executeCopilotAction(
  supabase: SupabaseClient,
  action: MessengerAiAction,
  payload: CopilotActionPayload,
  caller: ExecutorCaller
): Promise<string> {
  if (payload.kind === 'order_edit_items') return applyOrderEditOrCreate(supabase, action, payload, caller);
  if (payload.kind === 'order_hold_or_reschedule') return applyShipHold(supabase, payload, caller);
  if (payload.kind === 'order_cancel') return applyOrderCancel(supabase, payload, caller);
  if (payload.kind === 'payment_proof') return applyPaymentProof(supabase, action, payload, caller);
  if (payload.kind === 'payment_promise') return applyPaymentPromise(supabase, action, payload, caller);
  if (payload.kind === 'bus_shipping_request') return applyBusShippingRequest(supabase, payload, caller);
  if (payload.kind === 'damage_or_complaint') return applyDamageOrComplaint(supabase, action, payload, caller);
  if (payload.kind === 'waiting_prompt_reply') return applyWaitingPromptReply(supabase, payload, caller);
  if (payload.kind === 'delivery_or_order_note') return applyDeliveryOrOrderNote(supabase, payload, caller);
  throw new CopilotError('Unsupported action payload.');
}

export async function isActionSuperseded(
  supabase: SupabaseClient,
  action: { orderId: string | null; actionType: string; createdAt: string }
): Promise<boolean> {
  if (!action.orderId) return false;
  if (action.actionType === 'payment_proof') {
    const { data } = await supabase.from('payments').select('id').eq('order_id', action.orderId).gte('created_at', action.createdAt).limit(1);
    return Boolean(data && data.length > 0);
  }
  const statusByType: Record<string, string[]> = {
    order_edit_items: ['Order Edited'],
    order_cancel: ['Cancelled'],
    order_hold_or_reschedule: ['Marked Not Ready to Ship'],
    bus_shipping_request: ['Marked for bus shipping'],
  };
  const targets = statusByType[action.actionType];
  if (!targets) return false;
  const { data } = await supabase.from('order_logs').select('id').eq('order_id', action.orderId).in('status', targets).gte('created_at', action.createdAt).limit(1);
  return Boolean(data && data.length > 0);
}
