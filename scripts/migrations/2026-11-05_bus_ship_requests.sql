-- Orders marked "ship by bus" before they go (owner, 2026-11-05). Sales marks the
-- orders and picks the bus company and station; they show on Bus Shipping →
-- "Waiting for bus" until staff record the fee at the terminal (then the row is
-- deleted; the trip itself is in bus_shipments).

create table if not exists public.bus_ship_requests (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id),
  bus_company text not null,
  destination text not null,       -- bus station / terminal
  note text,
  requested_by_name text,
  requested_at timestamptz not null default now()
);
create index if not exists bus_ship_requests_customer_idx on public.bus_ship_requests (customer_id);

-- Through the API with the service role only.
alter table public.bus_ship_requests enable row level security;

notify pgrst, 'reload schema';

select count(*) as requests from public.bus_ship_requests;
