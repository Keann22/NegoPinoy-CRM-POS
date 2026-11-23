-- Order changed after it was printed (owner, 2026-11-23). Customers keep adding
-- to their orders on Messenger, sales edit the order, and the warehouse keeps
-- picking from the old printed form, so added items get left behind. Each edit
-- that changes the items of a printed or picked order leaves one row here; the
-- Inventory and owners' dashboards list them until someone reprints the form or
-- taps "Got it".

create table if not exists public.order_change_alerts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  -- [{ product_id, name, before, after }] for every product whose quantity changed
  changes jsonb not null,
  status_at_change text,
  was_printed boolean not null default false,
  changed_by text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by text,
  handled_how text check (handled_how in ('reprinted', 'seen', 'closed'))
);
create index if not exists order_change_alerts_open_idx
  on public.order_change_alerts (created_at desc) where handled_at is null;
create index if not exists order_change_alerts_order_idx
  on public.order_change_alerts (order_id, created_at);

-- Through the API with the service role only.
alter table public.order_change_alerts enable row level security;

notify pgrst, 'reload schema';

select count(*) as alerts from public.order_change_alerts;
