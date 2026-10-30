-- Customer Returns, phase 1. See architecture.md "Planned: Customer Returns" and
-- docs/BUSINESS_WORKFLOW.md "Customer returns".
--
--   customer_returns        one case per order problem (RTS parcel, damage report, shipped back)
--   customer_return_items   pieces in the case: qty, then Good / Damaged after the check
--   customer_return_events  timeline (opened, decided, arrived, checked, ...)
--   storage bucket customer-returns   damage photos (not confidential; staff see them)
--
-- Stock: only a Good piece from the check goes back on the shelf, through an
-- inventory_movements row of type 'return' (already mirrored to shelf_stock).
-- Damaged pieces never go back. The order is never set to Cancelled by this
-- feature (that would put every piece back, damaged ones too).
--
-- Server only (RLS on, no policies): the API uses the service role.

create table if not exists public.customer_returns (
  id uuid primary key default gen_random_uuid(),
  case_no bigint generated always as identity unique,
  order_id uuid not null references public.orders(id),
  source text not null check (source in ('rts', 'damage_report', 'shipped_back')),
  reason text not null,
  notes text,
  photo_urls text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by_name text,
  -- Owner decision
  outcome text check (outcome in
    ('reship', 'replacement', 'full_refund', 'partial_refund', 'store_credit', 'cancel_order', 'no_action')),
  ask_back boolean not null default false,
  replacement_timing text check (replacement_timing in ('now', 'after_arrival')),
  amount numeric not null default 0,
  courier_claim boolean not null default false,
  decision_note text,
  decided_at timestamptz,
  decided_by_name text,
  -- Parcel
  arrived_at timestamptz,
  arrived_by_name text,
  checked_at timestamptz,
  checked_by_name text,
  -- Good pieces put back on the shelf (once checked and decided, unless re-shipped)
  restocked_at timestamptz,
  -- Outcome carried out
  outcome_done_at timestamptz,
  outcome_done_by_name text,
  outcome_done_note text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_returns_status_idx on public.customer_returns (status, created_at desc);
create index if not exists customer_returns_order_idx on public.customer_returns (order_id);

create table if not exists public.customer_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.customer_returns(id) on delete cascade,
  order_item_id uuid,
  product_id uuid references public.products(id),
  product_name text,
  qty integer not null check (qty > 0),
  good_qty integer not null default 0,
  damaged_qty integer not null default 0,
  -- What happens to the damaged pieces (owners). 'never_came_back' when not asked back.
  damaged_action text check (damaged_action in ('throw_away', 'second_hand', 'never_came_back')),
  created_at timestamptz not null default now(),
  check (good_qty >= 0 and damaged_qty >= 0 and good_qty + damaged_qty <= qty)
);
create index if not exists customer_return_items_return_idx on public.customer_return_items (return_id);

create table if not exists public.customer_return_events (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.customer_returns(id) on delete cascade,
  event text not null,
  note text,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists customer_return_events_return_idx on public.customer_return_events (return_id, created_at);

alter table public.customer_returns enable row level security;
alter table public.customer_return_items enable row level security;
alter table public.customer_return_events enable row level security;

-- Damage photos. Public read (customer photos, nothing confidential); uploads go
-- through the API with the service role.
insert into storage.buckets (id, name, public)
values ('customer-returns', 'customer-returns', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

select
  (select count(*) from public.customer_returns) as cases,
  (select count(*) from storage.buckets where id = 'customer-returns') as bucket;
