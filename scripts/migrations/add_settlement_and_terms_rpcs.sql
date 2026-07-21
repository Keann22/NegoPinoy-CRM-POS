-- Atomic RPCs for early settlement of installment orders and for editing payment terms.
-- Both lock the order row and do all money math server-side, so a mid-flight failure
-- or a concurrent payment can never leave orders/payments/customers half-updated.
-- Applied 2026-07-21 via the Supabase Management API.

CREATE OR REPLACE FUNCTION public.settle_installment_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid := (payload->>'orderId')::uuid;
  v_settlement_total numeric := (payload->>'settlementTotal')::numeric;
  v_payment_date timestamptz := COALESCE((payload->>'paymentDate')::timestamptz, now());
  v_payment_method text := COALESCE(payload->>'paymentMethod', 'Cash');
  v_proof_url text := payload->>'proofUrl';
  v_staff_notes text := NULLIF(trim(payload->>'notes'), '');
  v_recorded_by uuid := (payload->>'recordedBy')::uuid;

  v_order RECORD;
  v_paid_before numeric;
  v_payment_now numeric;
  v_excess numeric;
  v_waived numeric;
  v_plan_desc text;
  v_note text;
  v_payment_id uuid;
BEGIN
  IF v_order_id IS NULL OR v_settlement_total IS NULL OR v_settlement_total < 0 THEN
    RAISE EXCEPTION 'Invalid settlement payload';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', v_order_id;
  END IF;
  IF v_order.payment_method IS DISTINCT FROM 'Installment' THEN
    RAISE EXCEPTION 'Order % is not an installment order', v_order_id;
  END IF;

  v_paid_before := COALESCE(v_order.amount_paid, 0);
  v_payment_now := GREATEST(0, v_settlement_total - v_paid_before);
  v_excess := GREATEST(0, v_paid_before - v_settlement_total);
  v_waived := GREATEST(0, COALESCE(v_order.total_amount, 0) - v_settlement_total);

  IF v_payment_now > 0 THEN
    v_plan_desc := CASE
      WHEN v_order.installment_months IS NOT NULL AND v_order.monthly_payment IS NOT NULL
        THEN v_order.installment_months || ' mo x ' || round(v_order.monthly_payment, 2)
      ELSE 'installment plan'
    END;
    v_note := 'Early settlement of ' || v_plan_desc || '. Interest waived: ' || round(v_waived, 2) || '.';
    IF v_staff_notes IS NOT NULL THEN
      v_note := v_note || ' ' || v_staff_notes;
    END IF;

    INSERT INTO payments (order_id, payment_date, amount, payment_method, proof_url, notes)
    VALUES (v_order_id, v_payment_date, v_payment_now, v_payment_method, v_proof_url, v_note)
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE orders SET
    payment_method = 'Full Payment',
    installment_months = NULL,
    monthly_payment = NULL,
    total_amount = v_settlement_total,
    amount_paid = v_paid_before + v_payment_now,
    balance_due = 0,
    status = 'Completed',
    completed_at = now()
  WHERE id = v_order_id;

  IF v_excess > 0 AND v_order.customer_id IS NOT NULL THEN
    UPDATE customers SET store_credit = COALESCE(store_credit, 0) + v_excess WHERE id = v_order.customer_id;
    INSERT INTO accounting_expenses (date, category, amount, description, recorded_by)
    VALUES (now(), 'Customer Store Credit Liability', v_excess,
      'Overpayment from early settlement of order ' || v_order_id || ' converted to store credit', v_recorded_by);
  END IF;

  RETURN jsonb_build_object(
    'paymentId', v_payment_id,
    'paymentAmount', v_payment_now,
    'interestWaived', v_waived,
    'excessToCredit', v_excess
  );
END;
$$;

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

  -- Moving to installment: total = paid so far + payment now + the remaining schedule.
  -- Moving away from installment: revert to the cash price (waives the installment markup).
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
