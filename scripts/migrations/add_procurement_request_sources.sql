-- Tracks which order(s) prompted a procurement draft request line, so a
-- "Staff Req." quantity on the Procurement Master Sheet can be traced back
-- to the specific order(s) that triggered it (e.g. a picker reporting an
-- item out-of-stock while picking a customer's order). A single draft line
-- can be backed by more than one order over time, since
-- /api/inventory/procurement-request sums requestedQty across submissions
-- for the same product into one purchase_order_items row.
create table if not exists public.procurement_request_sources (
  id uuid primary key default gen_random_uuid(),
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  quantity integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_procurement_request_sources_item
  on public.procurement_request_sources(purchase_order_item_id);
create index if not exists idx_procurement_request_sources_order
  on public.procurement_request_sources(order_id);
