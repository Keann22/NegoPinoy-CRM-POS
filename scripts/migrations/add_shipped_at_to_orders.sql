-- Adds a dedicated timestamp for when an order was actually marked "Shipped",
-- so reports (e.g. Accounting > Unpaid Shipped Orders) can measure days-overdue
-- from the real ship date instead of approximating with order_date.
alter table public.orders
  add column if not exists shipped_at timestamptz;

-- One-time backfill: orders that are already Shipped/Completed but predate this
-- column have no recorded ship date, so approximate it with order_date.
update public.orders
set shipped_at = order_date
where status in ('Shipped', 'Completed')
  and shipped_at is null;
