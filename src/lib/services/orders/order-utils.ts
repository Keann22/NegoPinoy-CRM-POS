import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderFormValues } from '@/lib/schemas/order';

/** Computes subtotal, totalDiscount, and insuranceFee from order items. */
export function computeOrderTotals(
  items: OrderFormValues['orderItems'],
  includeInsurance: boolean
) {
  const { subtotal, totalDiscount } = items.reduce(
    (acc, item) => {
      acc.subtotal += (item.sellingPriceAtSale || 0) * (item.quantity || 0);
      acc.totalDiscount += (item.discount || 0) * (item.quantity || 0);
      return acc;
    },
    { subtotal: 0, totalDiscount: 0 }
  );
  const insuranceFee = includeInsurance ? (subtotal - totalDiscount) * 0.01 : 0;
  return { subtotal, totalDiscount, insuranceFee };
}

/**
 * Saves which price type each line used. The `process_order_transaction` RPC
 * only knows the amount, and on edit it deletes and re-inserts every line, so
 * these columns are written right after it on both create and edit.
 * Never throws — the order itself is already saved.
 */
export async function saveOrderItemPriceTypes(
  supabase: SupabaseClient,
  orderId: string,
  items: OrderFormValues['orderItems']
): Promise<void> {
  for (const item of items) {
    if (!item.priceType) continue;
    const isCustom = item.priceType === 'custom';
    const { error } = await supabase
      .from('order_items')
      .update({
        price_type: item.priceType,
        price_override_reason: isCustom ? item.priceOverrideReason?.trim() || null : null,
        price_override_by: isCustom ? item.priceOverrideBy || null : null,
      })
      .eq('order_id', orderId)
      .eq('product_id', item.productId);
    if (error) console.error('Failed to save price type for order item:', error);
  }
}

/** Uploads a proof-of-payment file to Supabase Storage and returns the public URL. */
export async function uploadProofOfPayment(
  supabase: SupabaseClient,
  file: File
): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('proof_of_payment')
    .upload(fileName, file, { upsert: false });
  if (uploadError) throw uploadError;
  const { data: { publicUrl } } = supabase.storage.from('proof_of_payment').getPublicUrl(uploadData.path);
  return publicUrl;
}
