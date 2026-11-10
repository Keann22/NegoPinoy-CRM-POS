-- Migration: Store credit ledger table (2026-11-10)
-- Paste this script into the Supabase Dashboard SQL Editor and click "Run".

create table if not exists public.store_credit_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount numeric(12,2) not null,          -- + added, - used
  balance_after numeric(12,2),
  reason text not null,                   -- 'opening_balance','overpayment','used_on_order','returned_on_cancel','return_refund','bus_sf','edit_refund','manual'
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

alter table public.store_credit_entries enable row level security;

-- Policy & Permissions for authenticated staff
drop policy if exists "Staff can view store credit entries" on public.store_credit_entries;
create policy "Staff can view store credit entries"
  on public.store_credit_entries
  for select
  to authenticated
  using (true);

grant select on public.store_credit_entries to authenticated;

-- Seed opening balances for all customers who currently hold credit > 0
insert into public.store_credit_entries (customer_id, amount, balance_after, reason, created_by_name)
select
  id as customer_id,
  store_credit as amount,
  store_credit as balance_after,
  'opening_balance' as reason,
  'System Migration (2026-11-10)' as created_by_name
from public.customers
where store_credit > 0.009;
