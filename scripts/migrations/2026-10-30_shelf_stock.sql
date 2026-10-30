-- Stored shelf stock (unallocated) — step 1 of "Planned: Stored Shelf Stock and
-- Physical Stock" in architecture.md. Owner direction 2026-10-30.
--
-- Adds only. Nothing existing reads or writes these yet: stock_level,
-- process_order_transaction and every screen keep working as before.
--
--   products.shelf_stock      what is on the shelf, ready to pick (NULL = not started)
--   shelf_stock_movements     every change to it, one row each
--   change_shelf_stock()      add / take off (receive, return, pick, put back)
--   set_shelf_stock()         set to a count
--   start_shelf_stock()       set starting values in bulk
--
-- The functions are server-only (service role). Staff browsers cannot call them.

alter table public.products add column if not exists shelf_stock integer;

comment on column public.products.shelf_stock is
  'Unallocated stock kept as a stored, counted number: + receive/return, − when picked, set by shelf counts. NULL = not started. See architecture.md "Planned: Stored Shelf Stock".';

create table if not exists public.shelf_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  qty_change integer not null,
  balance_after integer not null,
  event_type text not null check (event_type in
    ('start', 'receive', 'return', 'pick', 'put_back', 'count', 'correction', 'borrow', 'other')),
  order_id uuid,
  order_item_id uuid,
  -- Same source_ref twice = the same event twice (double-tap, retry): applied once.
  source_ref text,
  reason text,
  performed_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists shelf_stock_movements_product_idx
  on public.shelf_stock_movements (product_id, created_at desc);
create unique index if not exists shelf_stock_movements_source_ref_key
  on public.shelf_stock_movements (source_ref) where source_ref is not null;

-- Server only, like purchase_receipts.
alter table public.shelf_stock_movements enable row level security;

-- Add or take off pieces. Returns the new shelf_stock.
create or replace function public.change_shelf_stock(
  p_product_id uuid,
  p_qty integer,
  p_event text,
  p_source_ref text default null,
  p_order_id uuid default null,
  p_order_item_id uuid default null,
  p_reason text default null,
  p_actor text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_balance integer;
begin
  if p_source_ref is not null
     and exists (select 1 from shelf_stock_movements where source_ref = p_source_ref) then
    select shelf_stock into v_balance from products where id = p_product_id;
    return v_balance;
  end if;

  begin
    update products set shelf_stock = coalesce(shelf_stock, 0) + p_qty
      where id = p_product_id
      returning shelf_stock into v_balance;
    if not found then
      raise exception 'Product % not found', p_product_id;
    end if;

    insert into shelf_stock_movements
      (product_id, qty_change, balance_after, event_type, order_id, order_item_id, source_ref, reason, performed_by_name)
    values
      (p_product_id, p_qty, v_balance, p_event, p_order_id, p_order_item_id, p_source_ref, p_reason, p_actor);
  exception when unique_violation then
    -- The same event arrived twice at the same moment: keep the first.
    select shelf_stock into v_balance from products where id = p_product_id;
  end;

  return v_balance;
end;
$$;

-- Set to a shelf count. Returns the change applied.
create or replace function public.set_shelf_stock(
  p_product_id uuid,
  p_count integer,
  p_event text default 'count',
  p_source_ref text default null,
  p_reason text default null,
  p_actor text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_old integer;
  v_delta integer;
begin
  if p_source_ref is not null
     and exists (select 1 from shelf_stock_movements where source_ref = p_source_ref) then
    return 0;
  end if;

  select shelf_stock into v_old from products where id = p_product_id for update;
  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;
  v_delta := p_count - coalesce(v_old, 0);

  begin
    update products set shelf_stock = p_count where id = p_product_id;
    insert into shelf_stock_movements
      (product_id, qty_change, balance_after, event_type, source_ref, reason, performed_by_name)
    values
      (p_product_id, v_delta, p_count, p_event, p_source_ref, p_reason, p_actor);
  exception when unique_violation then
    return 0;
  end;

  return v_delta;
end;
$$;

-- Starting values in bulk: p_rows = [{"product_id": "...", "value": 3, "reason": "..."}].
-- Returns how many products were set.
create or replace function public.start_shelf_stock(p_rows jsonb, p_actor text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_old integer;
  v_value integer;
  v_count integer := 0;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    v_value := (r->>'value')::integer;
    select shelf_stock into v_old from products where id = (r->>'product_id')::uuid for update;
    if not found then
      continue;
    end if;
    update products set shelf_stock = v_value where id = (r->>'product_id')::uuid;
    insert into shelf_stock_movements
      (product_id, qty_change, balance_after, event_type, reason, performed_by_name)
    values
      ((r->>'product_id')::uuid, v_value - coalesce(v_old, 0), v_value, 'start', r->>'reason', p_actor);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.change_shelf_stock(uuid, integer, text, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_shelf_stock(uuid, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.start_shelf_stock(jsonb, text) from public, anon, authenticated;
grant execute on function public.change_shelf_stock(uuid, integer, text, text, uuid, uuid, text, text) to service_role;
grant execute on function public.set_shelf_stock(uuid, integer, text, text, text, text) to service_role;
grant execute on function public.start_shelf_stock(jsonb, text) to service_role;

-- Ask PostgREST to pick up the new column and functions.
notify pgrst, 'reload schema';
