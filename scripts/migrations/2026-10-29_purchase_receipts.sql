-- Snap receipt: owners photograph receipts at the store; the server reads them,
-- records confident lines as purchases, and leaves the rest for staff to match.
-- Row level security is on with no policies, so only the server (service role)
-- can read these: receipt prices and suppliers never reach staff browsers.

create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by_id uuid,
  created_by_name text,
  supplier_id uuid references public.suppliers(id) on delete set null
);

create table if not exists public.purchase_receipt_photos (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  created_at timestamptz not null default now(),
  storage_path text not null,
  status text not null default 'reading',   -- reading | read | failed
  engine text,
  error text
);

create table if not exists public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  photo_id uuid references public.purchase_receipt_photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  raw_text text,
  description text,
  code text,
  qty numeric not null default 1,
  unit_cost numeric not null default 0,
  status text not null default 'unmatched', -- recorded | unmatched | not_product | not_in_list
  product_id uuid references public.products(id) on delete set null,
  po_id uuid references public.purchase_orders(id) on delete set null,
  matched_by text,                          -- alias | code | name | staff
  resolved_by_name text,
  resolved_at timestamptz
);
create index if not exists purchase_receipt_lines_status_idx on public.purchase_receipt_lines (status);
create index if not exists purchase_receipt_lines_receipt_idx on public.purchase_receipt_lines (receipt_id);

-- "SS LADLE 3PC" from this supplier means this product. Learned from staff matches.
create table if not exists public.receipt_line_aliases (
  id uuid primary key default gen_random_uuid(),
  supplier_key text not null default '',    -- supplier id, or '' when unknown
  text_key text not null,                   -- normalised receipt description
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by_name text,
  unique (supplier_key, text_key)
);

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_photos enable row level security;
alter table public.purchase_receipt_lines enable row level security;
alter table public.receipt_line_aliases enable row level security;
