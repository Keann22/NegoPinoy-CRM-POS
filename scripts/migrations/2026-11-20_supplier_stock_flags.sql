-- Out of stock at the supplier (owner, 2026-11-20). Owners or Jas mark a variant
-- when we can't get it anywhere for now (waiting for restock, only another
-- color/size, price went up, or we stop selling it). Sales are then asked,
-- per order, what the customer decided, and New Order warns before adding it.
-- One active flag per product; cleared flags stay as history.

create table if not exists public.supplier_stock_flags (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  status text not null check (status in ('waiting_restock', 'other_variant', 'price_up', 'stop_selling')),
  note text,
  alt_product_id uuid references public.products(id) on delete set null, -- "offer this instead"
  new_price numeric,                -- selling price after the increase (price_up)
  check_again_on date,              -- PHT date to ask the supplier again
  set_by_name text,
  set_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by_name text,
  clear_reason text                 -- back_in_stock | bought | changed
);
create unique index if not exists supplier_stock_flags_one_active
  on public.supplier_stock_flags (product_id) where cleared_at is null;

-- Sales' answers per order. The latest row per (flag, order) counts.
-- asked: shown to sales, no answer yet · waiting_customer: asked, ask again later
-- wait: customer will wait / agrees · agreed_on_order: ticked on New Order
-- editing: sales went to change, remove or cancel · keep_credit / refund /
-- credit_added / handled: the money step after a paid line was removed
-- gone: closed, nothing more to do
create table if not exists public.supplier_flag_answers (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.supplier_stock_flags(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  answer text not null check (answer in (
    'asked', 'waiting_customer', 'wait', 'agreed_on_order', 'editing',
    'keep_credit', 'refund', 'credit_added', 'handled', 'gone'
  )),
  amount numeric,                   -- money step: the amount it was about
  note text,
  by_name text,
  ask_again_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists supplier_flag_answers_flag_order_idx
  on public.supplier_flag_answers (flag_id, order_id, created_at desc);
create index if not exists supplier_flag_answers_order_idx
  on public.supplier_flag_answers (order_id);

-- Through the API with the service role only.
alter table public.supplier_stock_flags enable row level security;
alter table public.supplier_flag_answers enable row level security;

notify pgrst, 'reload schema';

select
  (select count(*) from public.supplier_stock_flags) as flags,
  (select count(*) from public.supplier_flag_answers) as answers;
