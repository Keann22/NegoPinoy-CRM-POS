-- Owner to-do (owner, 2026-11-25): remember when the owners last uploaded the
-- GCash statement (Payments → Verify) and the SPX remittance file, so the
-- Dashboard can say "last upload 9 days ago". Before this, neither upload was saved.
create table if not exists public.owner_uploads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('gcash_statement', 'spx_remittance')),
  uploaded_at timestamptz not null default now(),
  uploaded_by_name text,
  matched integer,
  file_name text
);
create index if not exists owner_uploads_kind_at on public.owner_uploads (kind, uploaded_at desc);
-- Server (service role) only.
alter table public.owner_uploads enable row level security;
