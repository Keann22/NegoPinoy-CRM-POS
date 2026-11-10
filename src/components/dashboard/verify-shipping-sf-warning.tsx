import type { Order } from '@/types';
import { isFreeShipping, owedNow } from '@/lib/services/shipping/courier-cod';

/**
 * Verify Shipping: the customer already paid the SPX shipping fee (Add SPX SF,
 * from store credit), so the receiver must pay no SF. Warns if staff switch the
 * Shipping Type away from Free Shipping, and if the customer still owes money
 * the courier would then collect from the receiver.
 */
export function SfPaidWarning({ order, shippingType }: { order: Order; shippingType: string }) {
  const sfPaid = Number(order.shippingFee ?? order.shipping_fee ?? 0);
  if (!(sfPaid > 0.009 && isFreeShipping(order.shipping_payment_type))) return null;

  const owed = owedNow(order);
  if (!isFreeShipping(shippingType)) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
        The customer already paid the SF (₱{sfPaid.toFixed(2)}). Keep <b>Free Shipping</b>, or the receiver may be
        asked to pay the SF again.
      </p>
    );
  }
  return (
    <p className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
      SF already paid by the customer (₱{sfPaid.toFixed(2)}). When booking in SPX, don&apos;t add the SF to the COD.
      {owed > 0.009 && (
        <span className="mt-1 block font-semibold text-amber-800 dark:text-amber-300">
          The customer still owes ₱{owed.toFixed(2)}. If it isn&apos;t paid before shipping, the courier collects it
          from the receiver (the COD below).
        </span>
      )}
    </p>
  );
}
