-- Recount requests: an owner asks Jas to count specific products. They show as a
-- sticky pop-up on every Jas account until each product is counted.
-- Server only (RLS on, no policies).

create table if not exists public.recount_requests (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,              -- one pop-up = one batch (same message)
  product_id uuid not null references public.products(id),
  message text not null,               -- shown at the top, in the owner's words
  requested_by_name text,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  counted_unit1 integer,
  counted_unit2 integer,
  done_by_name text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recount_requests_open_idx on public.recount_requests (status, created_at);

alter table public.recount_requests enable row level security;

notify pgrst, 'reload schema';

select count(*) as recount_requests from public.recount_requests;
