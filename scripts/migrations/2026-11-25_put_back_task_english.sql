-- Put-back task text in English (owner, 2026-11-25: every screen in English).
-- Same function as 2026-11-23_put_back_tasks.sql; only the task message changed.

CREATE OR REPLACE FUNCTION public.trg_put_back_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_by text;
  v_lines text;
  v_pieces integer;
  v_ids uuid[];
  v_names text;
  v_where text;
  v_now_ph timestamp := (now() at time zone 'Asia/Manila');
  v_due_ph timestamp;
  v_message text;
begin
  begin
    -- Un-cancelled: the pieces belong to the order again, nothing to put back.
    if old.status = 'Cancelled' and new.status is distinct from 'Cancelled' then
      update staff_tasks set status = 'cancelled', cancelled_at = now()
        where order_id = new.id and kind = 'put_back' and status = 'open';
      return null;
    end if;
    if new.status is distinct from 'Cancelled' then
      return null;
    end if;

    select coalesce(nullif(trim(concat_ws(' ', u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'last_name')), ''), u.email)
      into v_by from auth.users u where u.id = auth.uid();

    -- Order history: who cancelled, from which status (skip if a path already logged it).
    if not exists (select 1 from order_logs l where l.order_id = new.id and l.status = 'Cancelled'
                     and l.created_at > now() - interval '2 minutes') then
      insert into order_logs (order_id, status, user_name, snapshot_data)
        values (new.id, 'Cancelled', coalesce(v_by, 'System'), jsonb_build_object('from_status', old.status));
    end if;

    -- The pieces the shelf sync just put back (same transaction = same now()).
    -- Variant names are often already part of the product name ("Ha121 Wok pan - 34cm").
    select string_agg('• ' || m.qty || ' × ' || coalesce(nullif(trim(
             case when coalesce(p.variant_name, '') = '' or p.name ilike '%' || p.variant_name || '%' then p.name
                  else p.name || ' - ' || p.variant_name end), ''), p.sku, 'Item'),
                      E'\n' order by p.name),
           sum(m.qty)
      into v_lines, v_pieces
      from (select product_id, sum(qty_change)::integer as qty
              from shelf_stock_movements
             where order_id = new.id and event_type = 'put_back' and created_at >= now()
             group by product_id) m
      join products p on p.id = m.product_id
     where m.qty > 0;
    if coalesce(v_pieces, 0) <= 0 then
      return null;
    end if;

    select array_agg(distinct u.id) into v_ids
      from put_back_team() t join auth.users u on lower(u.email) = t.email;
    if v_ids is null then
      return null;
    end if;
    -- Keep the team order as written (Jas, Al, Edric).
    select string_agg(label, ', ' order by first_pos) into v_names
      from (select label, min(ord) as first_pos
              from (select label, row_number() over () as ord from put_back_team()) x
             group by label) y;

    v_where := case
      when old.status in ('Packed', 'For Shipping', 'For Pick-up', 'On-Hold')
        then 'Already packed (' || old.status || '): open the box and put the items back on the shelf.'
      else 'Already picked (' || coalesce(old.status, '?') || '): still in the tray / packing area, put it back on the shelf.'
    end;

    -- Due today 6 PM if cancelled before 4 PM, otherwise tomorrow noon (Monday if that's a Sunday).
    if extract(hour from v_now_ph) < 16 and extract(dow from v_now_ph) <> 0 then
      v_due_ph := date_trunc('day', v_now_ph) + interval '18 hours';
    else
      v_due_ph := date_trunc('day', v_now_ph) + interval '1 day 12 hours';
      if extract(dow from v_due_ph) = 0 then
        v_due_ph := v_due_ph + interval '1 day';
      end if;
    end if;

    v_message := 'Put back on the shelf: order cancelled' || coalesce(' by ' || v_by, '') || '. ' || v_where
      || E'\n' || v_lines
      || E'\nOnly one person does it (' || v_names || '): once the pieces are back, tap Done.';
    if length(v_message) > 1000 then
      v_message := left(v_message, 997) || '...';
    end if;

    insert into staff_tasks (message, order_id, assignee_ids, assignee_name, assigned_by_id, assigned_by_name, due_at, kind)
      values (v_message, new.id, v_ids, v_names, null, 'Auto (cancelled order)',
              v_due_ph at time zone 'Asia/Manila', 'put_back')
      on conflict (order_id) where kind = 'put_back' and status = 'open'
      do update set message = excluded.message, due_at = excluded.due_at;
  exception when others then
    -- Never block a cancel because of the task.
    begin
      insert into shelf_stock_errors (order_id, context, message) values (new.id, 'put_back_task', SQLERRM);
    exception when others then null;
    end;
  end;
  return null;
end;
$function$
;
