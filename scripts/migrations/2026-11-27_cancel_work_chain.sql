-- Order Cancellation Work-Chain (owner confirmed, 2026-11-27).
-- 1. Put-back tasks go to Al & Edric only (remove Jas).
-- 2. Fix process_order_transaction so editing an order to Cancelled does not re-deduct stock.
-- 3. Fix shelf_order_targets so orders Returned earlier and later re-packed restore shelf_stock and create put-back tasks.
-- 4. Update release_ship_hold_on_order_change to keep ship-together siblings updated (and prompt sales immediately if 1 sibling remains).
-- 5. Add trg_zz_order_cancel_cleanup to auto-close obsolete tasks, change alerts, pick skips, order issues, is_packed flags,
--    bus requests, STAFF_DRAFT procurement sources, and Pending unverified payments on Cancelled orders.
-- 6. One-time backfill for existing Cancelled orders with dangling tasks, STAFF_DRAFT sources, or is_packed = true.

-- 1. Put-back team: Al & Edric only
CREATE OR REPLACE FUNCTION public.put_back_team()
RETURNS TABLE(label text, email text)
LANGUAGE sql
IMMUTABLE
AS $function$
  VALUES ('Al', 'alpinakacute@gmail.com'),
         ('Edric', 'cedric@gmail.com'),
         ('Edric', 'cedrictimpug@gmail.com');
$function$;

-- 2. Fix process_order_transaction: do not re-deduct stock in the second loop when v_status = 'Cancelled'
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

-- 3. Fix shelf_order_targets: use most recent logistics status log instead of any historical Returned/Shipped log
CREATE OR REPLACE FUNCTION public.shelf_order_targets(p_order_id uuid)
 RETURNS TABLE(product_id uuid, qty integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with o as (
    select id, status from orders where id = p_order_id
  ),
  lines as (
    select oi.product_id, coalesce(oi.quantity, 0) as qty, coalesce(oi.is_packed, false) as is_packed,
           case when jsonb_typeof(p.assembly_recipe) = 'array' and jsonb_array_length(p.assembly_recipe) > 0
                then p.assembly_recipe end as recipe
    from order_items oi
    left join products p on p.id = oi.product_id
    where oi.order_id = p_order_id and oi.product_id is not null
  ),
  exploded as (
    select l.product_id, l.qty::numeric as qty, l.is_packed from lines l where l.recipe is null
    union all
    select coalesce(c->>'productId', c->>'component_id')::uuid,
           l.qty * coalesce(nullif((c->>'quantity')::numeric, 0), 1),
           l.is_packed
    from lines l, jsonb_array_elements(l.recipe) c
    where l.recipe is not null and coalesce(c->>'productId', c->>'component_id') is not null
  ),
  per_product as (
    select e.product_id,
           sum(e.qty) as all_qty,
           sum(e.qty) filter (where e.is_packed) as packed_qty
    from exploded e group by e.product_id
  ),
  os as (
    select i.product_id, max(coalesce(nullif(i.out_of_stock_qty, 0), 1)) as os_qty
    from order_issues i
    where i.order_id = p_order_id and i.status = 'open' and i.product_id is not null
    group by i.product_id
  ),
  left_before as (
    select coalesce((
      select l.status in ('Shipped', 'Completed', 'Payment Received (COD)', 'Delivered', 'Returned')
      from order_logs l
      where l.order_id = p_order_id
        and l.status in (
          'Picked', 'Picked (with issue)', 'Photo', 'Packed', 'For Shipping', 'For Pick-up',
          'Shipped', 'Completed', 'Payment Received (COD)', 'Delivered', 'Returned'
        )
      order by l.created_at desc
      limit 1
    ), false) as yes
  )
  select pp.product_id,
         round(case
           when o.status in ('Pending Payment', 'Processing', 'Waiting for Stock', 'On-Hold')
             then coalesce(pp.packed_qty, 0)
           when o.status = 'Picked (with issue)'
             then greatest(0, pp.all_qty - coalesce(os.os_qty, 0))
           when o.status = 'Cancelled'
             then case when (select yes from left_before) then pp.all_qty else 0 end
           else pp.all_qty
         end)::integer
  from per_product pp
  cross join o
  left join os on os.product_id = pp.product_id;
$function$;

-- 4. Update release_ship_hold_on_order_change to handle ship-together siblings when one order is Cancelled
CREATE OR REPLACE FUNCTION public.release_ship_hold_on_order_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_group_id uuid;
  v_cancelled_short text;
  v_sib_count integer;
  v_sib record;
  v_other_shorts text;
  v_new_reason text;
  v_today_ph date := (now() AT TIME ZONE 'Asia/Manila')::date;
begin
  if new.status = 'Cancelled' then
    select h.group_id into v_group_id
    from public.order_ship_holds h
    where h.order_id = new.id and h.released_at is null
    limit 1;
  end if;

  if coalesce(new.not_for_shipping_reason, '') = ''
     or new.status not in ('Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
                           'Packed', 'For Shipping', 'On-Hold', 'Waiting for Stock') then
    update public.order_ship_holds
       set released_at = now(),
           released_by_name = coalesce(released_by_name, 'System'),
           release_reason = case
             when new.status in ('Cancelled', 'Returned') then 'cancelled'
             when new.status not in ('Pending Payment', 'Processing', 'Picked', 'Picked (with issue)', 'Photo',
                                     'Packed', 'For Shipping', 'On-Hold', 'Waiting for Stock') then 'shipped'
             else 'cleared' end
     where order_id = new.id and released_at is null;
  end if;

  if new.status = 'Cancelled' and v_group_id is not null then
    v_cancelled_short := '#' || upper(left(new.id::text, 7));

    select count(*) into v_sib_count
    from public.order_ship_holds h
    where h.group_id = v_group_id and h.released_at is null and h.order_id <> new.id;

    if v_sib_count = 1 then
      select h.id, h.order_id, h.ship_via, h.note into v_sib
      from public.order_ship_holds h
      where h.group_id = v_group_id and h.released_at is null and h.order_id <> new.id
      limit 1;

      v_new_reason := 'Other: Ship-together order ' || v_cancelled_short || ' was cancelled — ready to ship?'
        || case when v_sib.ship_via = 'bus' then ' (bus)' else '' end;

      update public.order_ship_holds
         set group_id = null,
             kind = 'other',
             check_on = v_today_ph,
             ask_again_at = null,
             note = trim(both ' ' from coalesce(nullif(note, ''), '')
               || case when coalesce(note, '') <> '' then ' · ' else '' end
               || 'Ship-together order ' || v_cancelled_short || ' was cancelled — ready to ship?'),
             updated_by_name = 'System',
             updated_at = now()
       where id = v_sib.id;

      update public.orders
         set not_for_shipping_reason = v_new_reason
       where id = v_sib.order_id;
    elsif v_sib_count > 1 then
      for v_sib in
        select h.id, h.order_id, h.ship_via, h.note
        from public.order_ship_holds h
        where h.group_id = v_group_id and h.released_at is null and h.order_id <> new.id
      loop
        select string_agg('#' || upper(left(h2.order_id::text, 7)), ', ' order by h2.created_at)
          into v_other_shorts
        from public.order_ship_holds h2
        where h2.group_id = v_group_id and h2.released_at is null and h2.order_id <> v_sib.order_id;

        v_new_reason := 'Ships with ' || coalesce(v_other_shorts, '')
          || case when v_sib.ship_via = 'bus' then ' (bus)' else '' end
          || case when coalesce(v_sib.note, '') <> '' then ': ' || v_sib.note else '' end;

        update public.orders
           set not_for_shipping_reason = v_new_reason
         where id = v_sib.order_id;
      end loop;
    end if;
  end if;

  return new;
end;
$function$;

-- 5. Downstream cleanup trigger when an order transitions to Cancelled.
--    Named trg_zz_order_cancel_cleanup so it fires strictly AFTER trg_shelf_sync_orders
--    and trg_shelf_sync_orders_put_back.
CREATE OR REPLACE FUNCTION public.trg_order_cancel_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src record;
  v_new_expected integer;
begin
  begin
    -- 1) Close open non-put-back tasks and order notes on this order.
    update public.staff_tasks
       set status = 'cancelled',
           cancelled_at = now()
     where order_id = new.id
       and status = 'open'
       and coalesce(kind, '') <> 'put_back';

    -- 2) Close open order change alerts.
    update public.order_change_alerts
       set handled_at = now(),
           handled_by = 'System',
           handled_how = 'closed'
     where order_id = new.id
       and handled_at is null;

    -- 3) Resolve open pick skips.
    update public.order_pick_skips
       set resolved_at = now(),
           resolved_by_name = 'System',
           resolution = 'cancelled'
     where order_id = new.id
       and resolved_at is null;

    -- 4) Resolve open order issues.
    update public.order_issues
       set status = 'resolved'
     where order_id = new.id
       and status = 'open';

    -- 5) Reset stale is_packed flags on cancelled order items.
    update public.order_items
       set is_packed = false
     where order_id = new.id
       and is_packed = true;

    -- 6) Clear stale hold text on the cancelled order row.
    if coalesce(new.not_for_shipping_reason, '') <> '' then
      update public.orders
         set not_for_shipping_reason = null
       where id = new.id;
    end if;

    -- 7) Remove bus shipping waiting request if any.
    delete from public.bus_ship_requests
     where order_id = new.id;

    -- 8) Clean up STAFF_DRAFT procurement sources linked to this cancelled order.
    for v_src in
      select s.id as src_id, s.purchase_order_item_id, s.quantity
      from public.procurement_request_sources s
      join public.purchase_order_items poi on poi.id = s.purchase_order_item_id
      join public.purchase_orders po on po.id = poi.po_id
      where s.order_id = new.id
        and po.notes = 'STAFF_DRAFT'
        and po.status = 'pending_receipt'
    loop
      delete from public.procurement_request_sources where id = v_src.src_id;

      update public.purchase_order_items
         set expected_qty = expected_qty - v_src.quantity
       where id = v_src.purchase_order_item_id
       returning expected_qty into v_new_expected;

      if found and coalesce(v_new_expected, 0) <= 0 then
        delete from public.purchase_order_items where id = v_src.purchase_order_item_id;
      end if;
    end loop;

    -- 9) Auto-reject Pending (unverified) payments on this cancelled order.
    update public.payments
       set status = 'Rejected',
           notes = trim(both E'\n' from coalesce(notes, '') || E'\n[Auto-rejected: Order cancelled]')
     where order_id = new.id
       and status = 'Pending';

  exception when others then
    begin
      insert into public.shelf_stock_errors (order_id, context, message)
      values (new.id, 'cancel_cleanup', SQLERRM);
    exception when others then null;
    end;
  end;
  return null;
end;
$function$;

drop trigger if exists trg_zz_order_cancel_cleanup on public.orders;
create trigger trg_zz_order_cancel_cleanup
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status and new.status = 'Cancelled')
  execute function public.trg_order_cancel_cleanup();

-- 6. One-time backfill for already-Cancelled orders with dangling records
--    a) Close open non-put-back tasks on Cancelled orders
update public.staff_tasks t
   set status = 'cancelled',
       cancelled_at = now()
  from public.orders o
 where o.id = t.order_id
   and o.status = 'Cancelled'
   and t.status = 'open'
   and coalesce(t.kind, '') <> 'put_back';

--    b) Reset stale is_packed flags on Cancelled orders
update public.order_items oi
   set is_packed = false
  from public.orders o
 where o.id = oi.order_id
   and o.status = 'Cancelled'
   and oi.is_packed = true;

--    c) Clean dangling STAFF_DRAFT procurement sources for Cancelled orders
do $$
declare
  v_src record;
  v_new_expected integer;
begin
  for v_src in
    select s.id as src_id, s.purchase_order_item_id, s.quantity
    from public.procurement_request_sources s
    join public.orders o on o.id = s.order_id
    join public.purchase_order_items poi on poi.id = s.purchase_order_item_id
    join public.purchase_orders po on po.id = poi.po_id
    where o.status = 'Cancelled'
      and po.notes = 'STAFF_DRAFT'
      and po.status = 'pending_receipt'
  loop
    delete from public.procurement_request_sources where id = v_src.src_id;
    update public.purchase_order_items
       set expected_qty = expected_qty - v_src.quantity
     where id = v_src.purchase_order_item_id
     returning expected_qty into v_new_expected;
    if found and coalesce(v_new_expected, 0) <= 0 then
      delete from public.purchase_order_items where id = v_src.purchase_order_item_id;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
