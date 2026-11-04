-- GCash mismatch list for the Payment Fix page (/dashboard/payment-discrepancies).
-- One row per payment whose recorded amount differed from the GCash statement
-- (snapshot made 2026-10-30). The rows hold customer names and GCash details, so they
-- live only in the database (the GitHub repo is public) and only the server reads them
-- (service role); browsers never query this table directly.

create table if not exists public.payment_discrepancies (
  payment_id      uuid primary key,
  order_id        uuid not null,
  order_short_id  text not null,
  sales_person    text not null default '',
  sales_person_id uuid,
  customer_name   text not null default '',
  recorded_ref    text not null default '',
  actual_ref      text not null default '',
  recorded_amount numeric not null,
  gcash_amount    numeric not null,
  difference      numeric not null default 0,
  payment_date    timestamptz,
  match_type      text,
  proof_url       text,
  notes           text,
  payment_method  text,
  created_at      timestamptz not null default now()
);

alter table public.payment_discrepancies enable row level security;
revoke all on table public.payment_discrepancies from anon, authenticated;
