-- "Hindi pa ipi-pick" (owner, 2026-11-25): the warehouse says why it didn't pick
-- an order that the shelf covers (reserved, ships on a later date...). The
-- order's sales agent gets a pop-up: set the ship date (a "date" ship hold) or
-- say pick it now. Found 2026-11-25: 4 of the 7 orders on Ready to Pick →
-- Picked (with issue) had been skipped with no reason saved anywhere.

create table if not exists public.order_pick_skips (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  reason text not null check (reason in ('later', 'other')),
  note text,
  created_by_name text,
  created_at timestamptz not null default now(),
  -- "Asked customer, waiting": asked again after this.
  ask_again_at timestamptz,
  resolved_at timestamptz,
  resolved_by_name text,
  -- held (sales set a ship date), pick_now (sales: pick it), closed (order moved on)
  resolution text,
  -- Order note this question was made from (conversion 2026-11-25).
  converted_from text
);

create unique index if not exists order_pick_skips_one_open
  on public.order_pick_skips(order_id) where resolved_at is null;

alter table public.order_pick_skips enable row level security;
-- No policies: read and written only by the server (service role).
