-- Edit Order on an already-cancelled order added phantom stock (found 2026-11-27).
-- 2026-11-27_cancel_work_chain.sql made the second loop skip the deduction when the
-- order's status is Cancelled, but the first loop still added the original items back.
-- The Edit form has no status field, so the status only stays Cancelled when the order
-- was ALREADY cancelled (its stock was restored at cancel time): editing it then added
-- the items back a second time (tested: free to sell -30 -> -28 on an unchanged save).
-- Fix: read the order's status before the edit and skip the add-back when it was
-- already Cancelled. All four cases now net correctly:
--   active -> active: +old, -new | cancelled -> cancelled: nothing
--   active -> cancelled: +old    | cancelled -> active: -new

CREATE OR REPLACE FUNCTION public.process_order_transaction(payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
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
  v_old_status text;

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
    SELECT status INTO v_old_status FROM orders WHERE id = v_order_id;

    -- A cancelled order's stock was already restored when it was cancelled.
    IF NOT v_was_old_order AND v_old_status IS DISTINCT FROM 'Cancelled' THEN
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
        IF NOT v_is_old_order AND v_status IS DISTINCT FROM 'Cancelled' THEN
          PERFORM increment_stock((v_comp->>'productId')::uuid, -v_movement_qty);
          INSERT INTO inventory_movements (product_id, quantity_change, movement_type, timestamp, reason, unit_cost)
          VALUES ((v_comp->>'productId')::uuid, -v_movement_qty, 'sale', now(),
            CASE WHEN v_is_edit THEN 'Order Edited ' ELSE 'Order ' END || v_order_id || ' (Bundle: ' || v_product.name || ')',
            COALESCE((SELECT initial_unit_cost FROM products WHERE id = (v_comp->>'productId')::uuid), 0));
        END IF;
      END LOOP;
    ELSE
      v_actual_cost := COALESCE(v_product.initial_unit_cost, 0);
      IF NOT v_is_old_order AND v_status IS DISTINCT FROM 'Cancelled' THEN
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
$function$;

notify pgrst, 'reload schema';
