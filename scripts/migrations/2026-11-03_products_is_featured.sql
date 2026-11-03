-- 2026-11-03: the product shown at the top of the website ("Napili ngayong linggo").
-- Set from the CRM (Products → ⋯ → Feature on website). Only product rows, not sizes.
-- The website reads it with the public key, so anon may read this one column.
-- Product triggers only react to stock_level / shelf_location, so flipping this is safe.

alter table public.products add column if not exists is_featured boolean not null default false;
grant select (is_featured) on public.products to anon;

-- Undo:
-- revoke select (is_featured) on public.products from anon;
-- alter table public.products drop column if exists is_featured;
