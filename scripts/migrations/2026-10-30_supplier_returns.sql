-- Supplier Returns, phase 1. See architecture.md "Planned: Supplier Returns" and
-- docs/BUSINESS_WORKFLOW.md "Returns to suppliers".
--
--   supplier_returns         one row per bad batch set aside to return
--   supplier_return_events   timeline of each return (reported, handed back, replaced, ...)
--   suppliers.replacement_days   how many days this supplier gets before a return is overdue
--   inventory_movements type 'supplier_return' is now mirrored to shelf_stock
--
-- Server only (RLS on, no policies): the API strips supplier names and costs
-- for staff.

create table if not exists public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  return_no bigint generated always as identity unique,
  product_id uuid not null references public.products(id),
  qty integer not null check (qty > 0),
  reason text not null,
  found_at text not null default 'shelf'
    check (found_at in ('picker', 'shelf', 'unpacking', 'customer_return', 'other')),
  notes text,
  status text not null default 'to_return'
    check (status in ('to_return', 'with_supplier', 'closed')),
  -- Owners only:
  supplier_id uuid references public.suppliers(id),
  unit_cost numeric,
  refund_amount numeric not null default 0,
  -- Progress:
  replaced_qty integer not null default 0,
  outcome text check (outcome in
    ('replaced', 'refunded', 'partial_refund_kept', 'voucher', 'written_off', 'cancelled')),
  reported_by_name text,
  handed_back_at timestamptz,
  handed_back_by_name text,
  closed_at timestamptz,
  closed_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_returns_status_idx on public.supplier_returns (status, created_at desc);
create index if not exists supplier_returns_product_idx on public.supplier_returns (product_id);

create table if not exists public.supplier_return_events (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.supplier_returns(id) on delete cascade,
  event text not null,
  qty integer,
  amount numeric,
  note text,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists supplier_return_events_return_idx on public.supplier_return_events (return_id, created_at);

alter table public.supplier_returns enable row level security;
alter table public.supplier_return_events enable row level security;

alter table public.suppliers add column if not exists replacement_days integer not null default 7;

-- Mirror 'supplier_return' stock movements (set aside / put back) to shelf_stock.
create or replace function public.trg_shelf_from_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_types text[] := array['restock', 'return', 'assembly', 'used_in_assembly', 'receipt_correction', 'supplier_return'];
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
      when 'supplier_return' then 'other'
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

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns where table_name = 'suppliers' and column_name = 'replacement_days') as supplier_days_added,
  (select count(*) from public.supplier_returns) as returns;
