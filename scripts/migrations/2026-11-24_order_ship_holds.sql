-- Structured "not for shipping yet" holds (owner, 2026-11-24, phase 2).
-- The hold text stays in orders.not_for_shipping_reason (Packed Orders, Verify
-- Shipping and Bus Shipping read it); this table adds the reason type, the
-- check-again date and which orders ship together.

create table if not exists public.order_ship_holds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  -- Orders that ship together share a group id.
  group_id uuid,
  kind text not null check (kind in ('with_orders', 'payment', 'adding', 'date', 'other')),
  ship_via text not null default 'courier' check (ship_via in ('courier', 'bus')),
  note text,
  -- Philippine date when sales is asked "Ready na ba?".
  check_on date not null,
  -- "Asked customer, waiting": asked again after this.
  ask_again_at timestamptz,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_by_name text,
  updated_at timestamptz,
  released_at timestamptz,
  released_by_name text,
  release_reason text,
  -- Old free-text reason this hold was made from (conversion 2026-11-24).
  converted_from text
);

create unique index if not exists order_ship_holds_one_active
  on public.order_ship_holds(order_id) where released_at is null;
create index if not exists order_ship_holds_group on public.order_ship_holds(group_id) where released_at is null;

alter table public.order_ship_holds enable row level security;
-- No policies: read and written only by the server (service role).

-- A hold ends by itself when the order ships, is cancelled, or its
-- not-for-shipping note is cleared (Verify Shipping, Revert, Ready na).
create or replace function public.release_ship_hold_on_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
  return new;
end;
$$;

drop trigger if exists trg_release_ship_hold on public.orders;
create trigger trg_release_ship_hold
  after update of not_for_shipping_reason, status on public.orders
  for each row
  when (old.not_for_shipping_reason is distinct from new.not_for_shipping_reason or old.status is distinct from new.status)
  execute function public.release_ship_hold_on_order_change();
