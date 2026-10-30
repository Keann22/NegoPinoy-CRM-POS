-- Stored shelf stock, step 2: keep products.shelf_stock up to date on every
-- physical event. See architecture.md "Planned: Stored Shelf Stock and Physical Stock".
-- Needs 2026-10-30_shelf_stock.sql (step 1) first.
--
-- Orders: for each order the database works out how many pieces of each product
-- have been PICKED (taken off the shelf) from the order's status, lines and open
-- OS marks, using the same rules as the locked unallocated formula
-- (shelf-stock-service.ts). It keeps that number per order in
-- shelf_stock_order_picks and moves shelf_stock by the difference:
--   more picked than before  -> shelf goes down ('pick')
--   fewer picked than before -> shelf goes up   ('put_back'; e.g. picked order cancelled)
-- Triggers on orders / order_items / order_issues run it, so every screen is covered.
--
-- Physical stock movements (inventory_movements) are mirrored:
--   RESTOCK (receipts), return, assembly, used_in_assembly, receipt_correction.
-- Order movements (sale, Order Edited, Order Cancelled, ...) and count adjustments
-- are NOT mirrored: orders are handled above, counts call set_shelf_stock.
--
-- Safety:
--   * Nothing runs until shelf_stock_settings.live = 'true' (set at the end).
--     To stop everything instantly:  update shelf_stock_settings set value='false' where key='live';
--   * A failure never blocks an order or a receipt: it is written to
--     shelf_stock_errors and the original change goes through.
--   * stock_level, process_order_transaction and every screen are unchanged.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.shelf_stock_settings (
  key text primary key,
  value text not null
);
insert into public.shelf_stock_settings (key, value) values ('live', 'false')
  on conflict (key) do nothing;

-- Pieces of each product already taken off the shelf for each order.
create table if not exists public.shelf_stock_order_picks (
  order_id uuid not null,
  product_id uuid not null,
  picked_qty integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (order_id, product_id)
);

create table if not exists public.shelf_stock_errors (
  id bigserial primary key,
  order_id uuid,
  context text,
  message text,
  created_at timestamptz not null default now()
);

alter table public.shelf_stock_settings enable row level security;
alter table public.shelf_stock_order_picks enable row level security;
alter table public.shelf_stock_errors enable row level security;

create or replace function public.shelf_stock_is_live()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true' from shelf_stock_settings where key = 'live'), false);
$$;

-- ---------------------------------------------------------------------------
-- How many pieces of each product an order has taken off the shelf.
-- Mirrors the locked formula's "unpicked" rules (shelf-stock-service.ts):
--   Pending Payment / Processing / Waiting for Stock / On-Hold : only is_packed lines
--   Picked (with issue) : all lines minus the open OS qty (max per product)
--   Cancelled : 0 (pieces went back on the shelf), unless it had already left
--   anything else (Picked, Photo, Packed, For Shipping, For Pick-up, Shipped,
--   Completed, Payment Received (COD), Returned, ...) : all lines
-- Bundle lines count on their components (qty x recipe qty).
-- ---------------------------------------------------------------------------
create or replace function public.shelf_order_targets(p_order_id uuid)
returns table (product_id uuid, qty integer)
language sql stable security definer set search_path = public as $$
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
    select exists (
      select 1 from order_logs l
      where l.order_id = p_order_id
        and l.status in ('Shipped', 'Completed', 'Payment Received (COD)', 'Delivered', 'Returned')
    ) as yes
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
$$;

-- ---------------------------------------------------------------------------
-- Bring one order's picks up to date and move shelf_stock by the difference.
-- ---------------------------------------------------------------------------
create or replace function public.sync_order_shelf_picks(p_order_id uuid, p_context text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_delta integer;
  v_balance integer;
  v_status text;
begin
  if p_order_id is null or not shelf_stock_is_live() then
    return;
  end if;

  begin
    -- One sync per order at a time (picker submit and edits fire several triggers).
    perform pg_advisory_xact_lock(hashtextextended('shelf:' || p_order_id::text, 0));
    select status into v_status from orders where id = p_order_id;
    -- Deleted order: we can't tell whether its pieces came back, so leave the shelf alone.
    if v_status is null then
      return;
    end if;

    for r in
      with t as (select product_id, qty from shelf_order_targets(p_order_id)),
           c as (select product_id, picked_qty from shelf_stock_order_picks where order_id = p_order_id)
      select coalesce(t.product_id, c.product_id) as product_id,
             coalesce(t.qty, 0) as target,
             coalesce(c.picked_qty, 0) as current_qty
      from t full join c on c.product_id = t.product_id
    loop
      v_delta := r.target - r.current_qty;  -- > 0: more taken off the shelf
      continue when v_delta = 0;

      update products set shelf_stock = coalesce(shelf_stock, 0) - v_delta
        where id = r.product_id
        returning shelf_stock into v_balance;

      if found then
        insert into shelf_stock_movements
          (product_id, qty_change, balance_after, event_type, order_id, reason, performed_by_name)
        values
          (r.product_id, -v_delta, v_balance,
           case when v_delta > 0 then 'pick' else 'put_back' end,
           p_order_id,
           'Order #' || upper(left(p_order_id::text, 8)) || ' is ' || coalesce(v_status, '?')
             || case when v_delta > 0 then ': ' || v_delta || ' pc(s) picked'
                     else ': ' || (-v_delta) || ' pc(s) back on the shelf' end,
           'System (order sync: ' || coalesce(p_context, '?') || ')');
      end if;

      insert into shelf_stock_order_picks (order_id, product_id, picked_qty, updated_at)
        values (p_order_id, r.product_id, r.target, now())
        on conflict (order_id, product_id)
        do update set picked_qty = excluded.picked_qty, updated_at = now();
    end loop;
  exception when others then
    insert into shelf_stock_errors (order_id, context, message) values (p_order_id, p_context, SQLERRM);
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: orders, order_items, order_issues
-- ---------------------------------------------------------------------------
create or replace function public.trg_shelf_sync_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not shelf_stock_is_live() then
    return null;
  end if;
  if TG_TABLE_NAME = 'orders' then
    perform sync_order_shelf_picks(new.id, 'orders');
  elsif TG_OP = 'INSERT' then
    perform sync_order_shelf_picks(new.order_id, TG_TABLE_NAME);
  elsif TG_OP = 'DELETE' then
    perform sync_order_shelf_picks(old.order_id, TG_TABLE_NAME);
  else
    perform sync_order_shelf_picks(old.order_id, TG_TABLE_NAME);
    if new.order_id is distinct from old.order_id then
      perform sync_order_shelf_picks(new.order_id, TG_TABLE_NAME);
    end if;
  end if;
  return null;
exception when others then
  begin
    insert into shelf_stock_errors (context, message) values ('trigger ' || TG_TABLE_NAME, SQLERRM);
  exception when others then null;
  end;
  return null;
end;
$$;

drop trigger if exists trg_shelf_sync_orders on public.orders;
create trigger trg_shelf_sync_orders
  after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.trg_shelf_sync_order();

drop trigger if exists trg_shelf_sync_order_items on public.order_items;
create trigger trg_shelf_sync_order_items
  after insert or update or delete on public.order_items
  for each row execute function public.trg_shelf_sync_order();

drop trigger if exists trg_shelf_sync_order_issues on public.order_issues;
create trigger trg_shelf_sync_order_issues
  after insert or update or delete on public.order_issues
  for each row execute function public.trg_shelf_sync_order();

-- ---------------------------------------------------------------------------
-- Trigger: physical stock movements (receipts, returns, assembly, corrections)
-- ---------------------------------------------------------------------------
create or replace function public.trg_shelf_from_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_types text[] := array['restock', 'return', 'assembly', 'used_in_assembly', 'receipt_correction'];
  v_new_counts boolean := false;
  v_old_counts boolean := false;
  v_delta integer := 0;
  v_product uuid;
  v_type text;
  v_event text;
begin
  if not shelf_stock_is_live() then
    return null;
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new_counts := lower(coalesce(new.movement_type, '')) = any(v_types);
  end if;
  if TG_OP in ('UPDATE', 'DELETE') then
    v_old_counts := lower(coalesce(old.movement_type, '')) = any(v_types);
  end if;

  if TG_OP = 'INSERT' and v_new_counts then
    v_delta := coalesce(new.quantity_change, 0); v_product := new.product_id; v_type := lower(new.movement_type);
  elsif TG_OP = 'UPDATE' and (v_new_counts or v_old_counts) then
    v_delta := (case when v_new_counts then coalesce(new.quantity_change, 0) else 0 end)
             - (case when v_old_counts then coalesce(old.quantity_change, 0) else 0 end);
    v_product := new.product_id; v_type := lower(coalesce(new.movement_type, old.movement_type));
  elsif TG_OP = 'DELETE' and v_old_counts then
    v_delta := -coalesce(old.quantity_change, 0); v_product := old.product_id; v_type := lower(old.movement_type);
  end if;

  if v_delta <> 0 and v_product is not null then
    v_event := case v_type
      when 'restock' then 'receive'
      when 'return' then 'return'
      when 'receipt_correction' then 'correction'
      else 'other' end;
    perform change_shelf_stock(
      v_product, v_delta, v_event,
      case when TG_OP = 'INSERT' then 'mv:' || new.id::text end,
      null, null,
      left(case when TG_OP = 'DELETE' then 'Stock movement deleted: ' || coalesce(old.reason, '')
                when TG_OP = 'UPDATE' then 'Stock movement edited: ' || coalesce(new.reason, '')
                else coalesce(new.reason, v_type) end, 300),
      'System (stock movement)');
  end if;
  return null;
exception when others then
  begin
    insert into shelf_stock_errors (context, message) values ('trigger inventory_movements', SQLERRM);
  exception when others then null;
  end;
  return null;
end;
$$;

drop trigger if exists trg_shelf_from_movements on public.inventory_movements;
create trigger trg_shelf_from_movements
  after insert or update or delete on public.inventory_movements
  for each row execute function public.trg_shelf_from_movement();

-- ---------------------------------------------------------------------------
-- Server-only access
-- ---------------------------------------------------------------------------
revoke all on function public.shelf_order_targets(uuid) from public, anon, authenticated;
revoke all on function public.sync_order_shelf_picks(uuid, text) from public, anon, authenticated;
revoke all on function public.shelf_stock_is_live() from public, anon, authenticated;
grant execute on function public.shelf_order_targets(uuid) to service_role;
grant execute on function public.sync_order_shelf_picks(uuid, text) to service_role;
grant execute on function public.shelf_stock_is_live() to service_role;

-- ---------------------------------------------------------------------------
-- Go live: record what every existing order has already taken off the shelf
-- (without moving shelf_stock), then switch on. Right after this, the start
-- script resets shelf_stock to today's unallocated value
-- (scripts/fixes/start_shelf_stock.ts --apply).
-- ---------------------------------------------------------------------------
truncate public.shelf_stock_order_picks;
insert into public.shelf_stock_order_picks (order_id, product_id, picked_qty)
select o.id, t.product_id, t.qty
from public.orders o
cross join lateral public.shelf_order_targets(o.id) t
where t.qty <> 0;

update public.shelf_stock_settings set value = 'true' where key = 'live';

notify pgrst, 'reload schema';

select
  (select count(*) from public.shelf_stock_order_picks) as order_pick_rows,
  (select value from public.shelf_stock_settings where key = 'live') as live;
