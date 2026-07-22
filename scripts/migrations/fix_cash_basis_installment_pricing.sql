-- Fixes update_payment_terms(): the cash-basis revert (used when moving an order away
-- from Installment) was computed from orders.subtotal directly, which is inflated for
-- installment first-timers — those items are recorded at products.installment_price
-- instead of the true products.selling_price. Recompute per line item instead, using
-- the real cash price whenever the recorded sale price matches the product's
-- installment_price, and re-derive insurance (1% of the corrected subtotal) to match.
-- Applied 2026-07-21 via the Supabase Management API.

CREATE OR REPLACE FUNCTION public.update_payment_terms(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid := (payload->>'orderId')::uuid;
  v_payment_type text := payload->>'paymentType';
  v_installment_months integer := (payload->>'installmentMonths')::integer;
  v_monthly_payment numeric := (payload->>'monthlyPayment')::numeric;
  v_payment_now numeric := COALESCE((payload->>'paymentNow')::numeric, 0);
  v_payment_date timestamptz := COALESCE((payload->>'paymentDate')::timestamptz, now());
  v_proof_url text := payload->>'proofUrl';
  v_payment_notes text := COALESCE(NULLIF(trim(payload->>'paymentNotes'), ''), 'Payment collected via Edit Payment Terms');

  v_order RECORD;
  v_paid_before numeric;
  v_cash_subtotal numeric;
  v_cash_insurance numeric;
  v_cash_basis numeric;
  v_total numeric;
  v_amount_paid numeric;
  v_balance numeric;
  v_payment_id uuid;
BEGIN
  IF v_order_id IS NULL OR v_payment_type IS NULL THEN
    RAISE EXCEPTION 'Invalid payment terms payload';
  END IF;
  IF v_payment_type NOT IN ('Full Payment', 'Lay-away', 'Installment', 'COD', 'Pending') THEN
    RAISE EXCEPTION 'Unknown payment type: %', v_payment_type;
  END IF;
  IF v_payment_type = 'Installment' AND (COALESCE(v_installment_months, 0) <= 0 OR COALESCE(v_monthly_payment, 0) <= 0) THEN
    RAISE EXCEPTION 'Installment terms require months and monthly payment';
  END IF;
  IF v_payment_now < 0 THEN
    RAISE EXCEPTION 'Payment amount cannot be negative';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', v_order_id;
  END IF;

  v_paid_before := COALESCE(v_order.amount_paid, 0);

  SELECT COALESCE(SUM(
    (CASE
       WHEN COALESCE(p.installment_price, 0) > 0 AND abs(oi.selling_price_at_sale - p.installment_price) < 0.01
         THEN p.selling_price
       ELSE oi.selling_price_at_sale
     END - COALESCE(oi.discount, 0)) * oi.quantity
  ), 0)
  INTO v_cash_subtotal
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = v_order_id;

  v_cash_insurance := CASE WHEN COALESCE(v_order.insurance_fee, 0) > 0
    THEN (v_cash_subtotal - COALESCE(v_order.total_discount, 0)) * 0.01
    ELSE 0
  END;
  v_cash_basis := v_cash_subtotal - COALESCE(v_order.total_discount, 0) + v_cash_insurance + COALESCE(v_order.shipping_fee, 0);

  -- Moving to installment: total = paid so far + payment now + the remaining schedule.
  -- Moving away from installment: revert to the true cash price (waives the installment markup).
  v_total := COALESCE(v_order.total_amount, 0);
  IF v_payment_type = 'Installment' THEN
    v_total := v_paid_before + v_payment_now + (v_monthly_payment * v_installment_months);
  ELSIF v_order.payment_method = 'Installment' THEN
    v_total := v_cash_basis;
  END IF;

  v_amount_paid := v_paid_before + v_payment_now;
  v_balance := GREATEST(0, v_total - v_amount_paid);

  UPDATE orders SET
    payment_method = v_payment_type,
    installment_months = CASE WHEN v_payment_type = 'Installment' THEN v_installment_months ELSE NULL END,
    monthly_payment = CASE WHEN v_payment_type = 'Installment' THEN v_monthly_payment ELSE NULL END,
    total_amount = v_total,
    amount_paid = v_amount_paid,
    balance_due = v_balance
  WHERE id = v_order_id;

  -- Log only when proof was uploaded, to avoid duplicate rows across repeated edits.
  IF v_payment_now > 0 AND v_proof_url IS NOT NULL THEN
    INSERT INTO payments (order_id, payment_date, amount, payment_method, proof_url, notes)
    VALUES (v_order_id, v_payment_date, v_payment_now,
      CASE WHEN v_payment_type = 'Full Payment' THEN 'Full Payment' ELSE 'Downpayment' END,
      v_proof_url, v_payment_notes)
    RETURNING id INTO v_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'paymentId', v_payment_id,
    'totalAmount', v_total,
    'balanceDue', v_balance
  );
END;
$$;
