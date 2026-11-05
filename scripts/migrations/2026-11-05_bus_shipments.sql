-- Bus shipping fees (owner, 2026-11-05). Staff record what they paid the bus
-- company at the terminal; the fee becomes the orders' shipping fee and one
-- "Shipping Fee" expense. The rows also build the price history per bus company
-- and destination (Bus Rates). Bus companies charge by weight + item value, one
-- fee per trip, so one shipment can carry several orders of one customer.

create table if not exists public.bus_shipments (
  id uuid primary key default gen_random_uuid(),
  bus_company text not null,
  destination text not null,              -- terminal / town, e.g. "Binalonan, Pangasinan"
  fee numeric not null check (fee >= 0),  -- what we paid the bus company
  weight_kg numeric,
  declared_value numeric,                 -- item value told to the bus company
  box_count integer,
  receipt_url text,
  free_shipping boolean not null default false,  -- we pay the SF; customer isn't charged
  customer_id uuid references public.customers(id),
  sales_person_name text,
  -- Money check, worked out when the fee is saved:
  advance_sf numeric not null default 0,  -- what the customer had paid above the items
  credit_used numeric not null default 0, -- store credit taken back to cover the SF
  sf_owed numeric not null default 0,     -- customer still owes this much SF
  sf_extra numeric not null default 0,    -- customer sent this much more than the SF
  balance_after numeric,                  -- orders' balance right after saving (owed clears when it drops by sf_owed)
  -- The sales agent's pop-up:
  settled_at timestamptz,
  settled_by_name text,
  settle_note text,
  ask_again_at timestamptz,
  expense_id uuid references public.expenses(id),
  recorded_by_name text,
  shipped_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists bus_shipments_route_idx on public.bus_shipments (bus_company, destination);
create index if not exists bus_shipments_open_idx on public.bus_shipments (settled_at) where settled_at is null;

create table if not exists public.bus_shipment_orders (
  shipment_id uuid not null references public.bus_shipments(id) on delete cascade,
  order_id uuid not null references public.orders(id),
  fee_share numeric not null default 0,
  primary key (shipment_id, order_id)
);
create index if not exists bus_shipment_orders_order_idx on public.bus_shipment_orders (order_id);

-- Everything goes through the API with the service role.
alter table public.bus_shipments enable row level security;
alter table public.bus_shipment_orders enable row level security;

-- Photos of the bus company's receipt. Bus fees aren't confidential (owner,
-- 2026-11-05), so public read like the returns photos; uploads via the API.
insert into storage.buckets (id, name, public)
values ('bus-receipts', 'bus-receipts', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

select
  (select count(*) from public.bus_shipments) as shipments,
  (select count(*) from storage.buckets where id = 'bus-receipts') as bucket;
