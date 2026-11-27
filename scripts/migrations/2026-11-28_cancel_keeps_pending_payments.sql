-- Cancelling an order no longer auto-rejects its Pending (unverified) payments (owner, 2026-11-28).
-- Why: Log Payment counts a Pending payment as paid at once, so an order with one is a
-- "paid" order: the owners give store credit or a refund for it when it is cancelled.
-- Rejecting the payment then hid it from the GCash statement check (Pass 1/2 only look at
-- Pending), so credit or refunds were never checked against money really received, and the
-- order said "paid" while its only payment said Rejected. The payment now stays Pending;
-- owners verify it on Payments Log -> Pending -> "Cancelled Orders".
-- Same function as 2026-11-27_cancel_work_chain.sql without step 9. No payment had been
-- auto-rejected yet when this was applied, so nothing to restore.

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

    -- (Pending payments are left for the owners to verify against the GCash statement.)

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

notify pgrst, 'reload schema';
