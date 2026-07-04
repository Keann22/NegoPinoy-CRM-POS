-- Tracks customer returns and their disposition: restock (sellable, goes back
-- into stock_level), exchange (reshipped, no net stock effect), or writeoff
-- (damaged/unsellable, stays out of stock_level as shrinkage).
create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  order_item_id uuid references public.order_items(id),
  product_id uuid references public.products(id),
  product_name text,
  quantity integer not null,
  return_type text not null check (return_type in ('restock', 'exchange', 'writeoff')),
  reason_code text,
  notes text,
  processed_by text,
  created_at timestamptz not null default now()
);
