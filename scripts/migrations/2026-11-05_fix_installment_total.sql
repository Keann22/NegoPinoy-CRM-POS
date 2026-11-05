-- Edit Payment Terms: an Installment total is the order's price (owner data, 2026-11-05:
-- 313 of 326 installment orders already equal their price). The old formula added money
-- paid before the terms were set on top of the plan (#9BD7150: ₱11,155 for ₱9,550 items).

CREATE OR REPLACE FUNCTION public.update_payment_terms(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
  v_cash_basis := COALESCE(v_order.subtotal, 0) - COALESCE(v_order.total_discount, 0)
    + COALESCE(v_order.insurance_fee, 0) + COALESCE(v_order.shipping_fee, 0);

  -- Installment has no interest: the total is the order's price (items - discount +
  -- insurance + shipping); months x monthly is only a guide for what to collect.
  -- (Fixed 2026-11-05: it used to be paid so far + payment now + months x monthly,
  -- which counted money paid before the terms were set twice, e.g. #9BD7150.)
  -- Moving away from installment: also the cash price.
  v_total := COALESCE(v_order.total_amount, 0);
  IF v_payment_type = 'Installment' THEN
    v_total := CASE WHEN v_cash_basis > 0 THEN v_cash_basis
                    ELSE v_paid_before + v_payment_now + (v_monthly_payment * v_installment_months) END;
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
$function$;
