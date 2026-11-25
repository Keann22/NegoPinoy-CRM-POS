-- Allow selecting multiple alternative variants when status is 'other_variant'
-- (owner, 2026-11-25). Keeps alt_product_id for backwards compatibility.

alter table public.supplier_stock_flags
  add column if not exists alt_product_ids uuid[] not null default '{}';

update public.supplier_stock_flags
set alt_product_ids = array[alt_product_id]
where alt_product_id is not null
  and cardinality(alt_product_ids) = 0;

notify pgrst, 'reload schema';
