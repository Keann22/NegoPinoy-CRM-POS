-- One GCash transfer that pays several orders (owner, 2026-11-04).
-- Each order still gets its own payment row; the rows of one transfer share a
-- transfer_id, and transfer_amount is the whole amount on the GCash screenshot.
-- Both are empty for ordinary one-order payments.

alter table public.payments add column if not exists transfer_id uuid;
alter table public.payments add column if not exists transfer_amount numeric;

create index if not exists payments_transfer_id_idx on public.payments (transfer_id) where transfer_id is not null;
create index if not exists payments_reference_number_idx on public.payments (reference_number) where reference_number is not null;
