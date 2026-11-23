-- Put-back tasks (owner, 2026-11-23).
-- When sales cancel an order that was already picked, the system puts the
-- pieces back on the shelf number, but nobody told the warehouse to put the
-- real pieces back (checked 2026-11-23: in 30 days, 23 cancelled orders still
-- had picked pieces, 93 pieces). Count only the put-back AT the cancel: earlier
-- put-backs are OS / re-pick flips (B90A711 showed 6 soup pots for 1). Now the cancel creates ONE shared task for the
-- put-back team (Jas, Al, Edric): everyone on the team sees it, and whoever puts
-- the pieces back taps "Tapos na", which closes it for all.
--
-- Also: cancelling now writes a "Cancelled" row in the order's history (who and
-- from which status). Before this, no cancel path logged it.
--
-- Works for every cancel path (Orders page, Edit Order, supplier pop-up...)
-- because it runs on the orders table, right after trg_shelf_sync_orders has
-- moved the pieces back (triggers fire in name order; this name sorts after it).
-- Courier returns are not included: their pieces came back in a parcel and the
-- Returns flow has its own put-back step (the shelf sync doesn't put them back).

alter table public.staff_tasks add column if not exists kind text;
comment on column public.staff_tasks.kind is
  'null = assigned by an owner; put_back = automatic task to put a cancelled order''s picked pieces back on the shelf';

create unique index if not exists staff_tasks_open_put_back_idx
  on public.staff_tasks (order_id) where kind = 'put_back' and status = 'open';

-- Who gets put-back tasks. One person can have several accounts (Jas has three).
create or replace function public.put_back_team()
returns table (label text, email text) language sql immutable as $$
  values ('Jas', 'jas@gmail.com'), ('Jas', 'jas@usares.com'), ('Jas', 'jassy@gmail.com'),
         ('Al', 'alpinakacute@gmail.com'),
         ('Edric', 'cedric@gmail.com'), ('Edric', 'cedrictimpug@gmail.com');
$$;

create or replace function public.trg_put_back_task()
returns trigger language plpgsql security definer set search_path = public, auth as $$
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
        then 'Naka-pack na (' || old.status || '): buksan ang box, ibalik sa shelf ang laman.'
      else 'Napick na (' || coalesce(old.status, '?') || '): nasa tray / packing area pa, ibalik sa shelf.'
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

    v_message := 'Ibalik sa shelf: cancelled ang order' || coalesce(' ni ' || v_by, '') || '. ' || v_where
      || E'\n' || v_lines
      || E'\nIsa lang ang gagawa (' || v_names || '): pag naibalik na, i-tap ang Tapos na.';
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
$$;

-- Name sorts after trg_shelf_sync_orders, so the shelf has already moved.
drop trigger if exists trg_shelf_sync_orders_put_back on public.orders;
create trigger trg_shelf_sync_orders_put_back
  after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.trg_put_back_task();

notify pgrst, 'reload schema';

select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and not tgisinternal order by tgname;
