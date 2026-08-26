-- Fix: RPCs inserted into non-existent table accounting_expenses (date,...,recorded_by).
-- Real table is public.expenses (expense_date, category, amount, description).
-- This caused 'Edit Failed: relation accounting_expenses does not exist' on order edits
-- whenever the edit produced an overpayment converted to store credit.
-- Redeploys process_order_transaction + settle_installment_order + update_payment_terms.

CREATE OR REPLACE FUNCTION public.process_order_transaction(payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid;
  v_customer_id uuid;
  v_status text;
  v_total_amount numeric;
  v_payment_method text;
  v_notes text;
  v_installment_months integer;
  v_monthly_payment numeric;
  v_order_date timestamptz;
  v_subtotal numeric;
  v_total_discount numeric;
  v_insurance_fee numeric;
  v_balance_due numeric;
  v_sales_person_id uuid;
  v_sales_person_name text;
  v_platform_fees numeric;
  v_tracking_number text;
  v_amount_paid numeric;
  v_proof_url text;
  
  v_item jsonb;
  v_item_product_id uuid;
  v_item_qty integer;
  v_item_price numeric;
  v_item_discount numeric;
  
  v_is_edit boolean;
  v_was_old_order boolean;
  v_is_old_order boolean;
  
  v_product RECORD;
  v_comp jsonb;
  v_movement_qty integer;
  v_actual_cost numeric;
  
  v_overpayment numeric := 0;
  v_customer_credit numeric;
BEGIN
  v_order_id := (payload->>'orderId')::uuid;
  v_customer_id := (payload->>'customerId')::uuid;
  v_status := payload->>'orderStatus';
  v_total_amount := (payload->>'totalAmount')::numeric;
  v_payment_method := payload->>'paymentType';
  v_notes := payload->>'shippingDetails';
  v_installment_months := (payload->>'installmentMonths')::integer;
  v_monthly_payment := (payload->>'monthlyPayment')::numeric;
  v_order_date := (payload->>'orderDate')::timestamptz;
  v_subtotal := (payload->>'subtotal')::numeric;
  v_total_discount := (payload->>'totalDiscount')::numeric;
  v_insurance_fee := (payload->>'insuranceFee')::numeric;
  v_balance_due := (payload->>'balanceDue')::numeric;
  v_sales_person_id := (payload->>'salesPersonId')::uuid;
  v_sales_person_name := payload->>'salesPersonName';
  v_platform_fees := (payload->>'platformFees')::numeric;
  v_tracking_number := payload->>'trackingNumber';
  v_amount_paid := (payload->>'amountPaid')::numeric;
  v_proof_url := payload->>'proofUrl';
  
  v_is_edit := (payload->>'isEdit')::boolean;
  v_was_old_order := COALESCE((payload->>'wasOldOrder')::boolean, false);
  v_is_old_order := COALESCE(v_order_date < '2026-06-01T00:00:00+08:00'::timestamptz, false);

  IF v_is_edit THEN
    IF NOT v_was_old_order THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'originalOrderItems')
      LOOP
        v_item_product_id := (v_item->>'productId')::uuid;
        v_item_qty := (v_item->>'quantity')::integer;
        
        SELECT * INTO v_product FROM products WHERE id = v_item_product_id;
        
        IF jsonb_array_length(to_jsonb(v_product.assembly_recipe)) > 0 THEN
          FOR v_comp IN SELECT * FROM jsonb_array_elements(to_jsonb(v_product.assembly_recipe))
          LOOP
            v_movement_qty := v_item_qty * (v_comp->>'quantity')::integer;
            PERFORM increment_stock((v_comp->>'productId')::uuid, v_movement_qty);
            INSERT INTO inventory_movements (product_id, quantity_change, movement_type, timestamp, reason, unit_cost)
            VALUES ((v_comp->>'productId')::uuid, v_movement_qty, 'adjustment', now(), 'Order Edit Reversal for ' || v_order_id, 0);
          END LOOP;
        ELSE
          PERFORM increment_stock(v_item_product_id, v_item_qty);
          INSERT INTO inventory_movements (product_id, quantity_change, movement_type, timestamp, reason, unit_cost)
          VALUES (v_item_product_id, v_item_qty, 'adjustment', now(), 'Order Edit Reversal for ' || v_order_id, 0);
        END IF;
      END LOOP;
    END IF;

    DELETE FROM order_items WHERE order_id = v_order_id;
    
    UPDATE orders SET
      customer_id = v_customer_id,
      status = v_status,
      total_amount = v_total_amount,
      payment_method = v_payment_method,
      notes = v_notes,
      installment_months = v_installment_months,
      monthly_payment = v_monthly_payment,
      subtotal = v_subtotal,
      total_discount = v_total_discount,
      insurance_fee = v_insurance_fee,
      balance_due = v_balance_due,
      tracking_number = v_tracking_number,
      amount_paid = v_amount_paid
    WHERE id = v_order_id;
    
  ELSE
    INSERT INTO orders (
      customer_id, status, total_amount, payment_method, notes,
      installment_months, monthly_payment, order_date, subtotal,
      total_discount, insurance_fee, balance_due, sales_person_id,
      sales_person_name, platform_fees, tracking_number, amount_paid
    ) VALUES (
      v_customer_id, v_status, v_total_amount, v_payment_method, v_notes,
      v_installment_months, v_monthly_payment, v_order_date, v_subtotal,
      v_total_discount, v_insurance_fee, v_balance_due, v_sales_person_id,
      v_sales_person_name, v_platform_fees, v_tracking_number, v_amount_paid
    ) RETURNING id INTO v_order_id;

    IF COALESCE(v_amount_paid, 0) > 0 THEN
      INSERT INTO payments (
        order_id, payment_date, amount, payment_method, proof_url, notes
      ) VALUES (
        v_order_id, v_order_date, v_amount_paid, 
        CASE WHEN v_payment_method = 'Full Payment' THEN 'Full Payment' ELSE 'Downpayment' END,
        v_proof_url, 'Initial Order Payment'
      );
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'orderItems')
  LOOP
    v_item_product_id := (v_item->>'productId')::uuid;
    v_item_qty := (v_item->>'quantity')::integer;
    v_item_price := COALESCE((v_item->>'sellingPriceAtSale')::numeric, 0);
    v_item_discount := COALESCE((v_item->>'discount')::numeric, 0);
    v_actual_cost := 0;

    SELECT * INTO v_product FROM products WHERE id = v_item_product_id;

    IF jsonb_array_length(to_jsonb(v_product.assembly_recipe)) > 0 THEN
      FOR v_comp IN SELECT * FROM jsonb_array_elements(to_jsonb(v_product.assembly_recipe))
      LOOP
        v_movement_qty := v_item_qty * (v_comp->>'quantity')::integer;
        v_actual_cost := v_actual_cost + (COALESCE((SELECT initial_unit_cost FROM products WHERE id = (v_comp->>'productId')::uuid), 0) * (v_comp->>'quantity')::integer);
        IF NOT v_is_old_order THEN
          PERFORM increment_stock((v_comp->>'productId')::uuid, -v_movement_qty);
          INSERT INTO inventory_movements (product_id, quantity_change, movement_type, timestamp, reason, unit_cost)
          VALUES ((v_comp->>'productId')::uuid, -v_movement_qty, 'sale', now(), 
            CASE WHEN v_is_edit THEN 'Order Edited ' ELSE 'Order ' END || v_order_id || ' (Bundle: ' || v_product.name || ')', 
            COALESCE((SELECT initial_unit_cost FROM products WHERE id = (v_comp->>'productId')::uuid), 0));
        END IF;
      END LOOP;
    ELSE
      v_actual_cost := COALESCE(v_product.initial_unit_cost, 0);
      IF NOT v_is_old_order THEN
        PERFORM increment_stock(v_item_product_id, -v_item_qty);
        INSERT INTO inventory_movements (product_id, quantity_change, movement_type, timestamp, reason, unit_cost)
        VALUES (v_item_product_id, -v_item_qty, 'sale', now(), 
          CASE WHEN v_is_edit THEN 'Order Edited ' ELSE 'Order ' END || v_order_id, 
          v_actual_cost);
      END IF;
    END IF;

    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price,
      cost_price_at_sale, selling_price_at_sale, discount
    ) VALUES (
      v_order_id, v_item_product_id, v_item->>'productName', COALESCE(v_item_qty, 0),
      v_item_price, v_actual_cost, v_item_price, v_item_discount
    );
  END LOOP;

  v_overpayment := COALESCE((payload->>'overpayment')::numeric, 0);
  IF v_overpayment > 0 AND v_customer_id IS NOT NULL THEN
    IF v_is_edit THEN
      UPDATE customers SET store_credit = COALESCE(store_credit, 0) + v_overpayment WHERE id = v_customer_id;
      INSERT INTO expenses (expense_date, category, amount, description)
      VALUES (now(), 'Customer Store Credit Liability', v_overpayment, 'Overpayment from edited order ' || v_order_id || ' converted to store credit');
    ELSE
      UPDATE customers SET store_credit = COALESCE(store_credit, 0) - v_overpayment WHERE id = v_customer_id;
    END IF;
  END IF;

  RETURN v_order_id;
END;
$$;


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
    INSERT INTO expenses (expense_date, category, amount, description)
    VALUES (now(), 'Customer Store Credit Liability', v_excess,
      'Overpayment from early settlement of order ' || v_order_id || ' converted to store credit');
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
