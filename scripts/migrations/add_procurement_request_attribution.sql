-- Tracks which staff account created/bumped a procurement draft request line,
-- so "Staff Req." quantities on the Procurement Master Sheet can be traced
-- back to a person instead of being anonymous. Existing rows will have this
-- as null since there's no way to backfill historical attribution.
alter table public.purchase_order_items
  add column if not exists requested_by_name text;
