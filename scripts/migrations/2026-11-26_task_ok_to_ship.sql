-- Sales tapped "OK to ship" on a task about an order (owner, 2026-11-26):
-- the warehouse copy of the task shows who said so and when (green tag).
alter table public.staff_tasks add column if not exists ok_to_ship_at timestamptz;
alter table public.staff_tasks add column if not exists ok_to_ship_by text;
