-- Order notes for a person or team (owner, 2026-11-25).
-- Sales wrote requests for the warehouse as order notes ("meron na daw stock,
-- pacheck", "pwede na padala") and nobody was told. Now a note can be sent to
-- Inventory (Jas, Al, Tess, Edric, Rey), the Owners, the order's sales agent or
-- one person. It is a staff_tasks row with kind = 'note': it pops up for them and
-- stays on their dashboard until answered. Notes go both ways (inventory → sales too).
--
--   needs_answer  true  = "Kailangan ng sagot": open until they reply or tap Tapos na
--                 false = "Pasabi lang po": closes when they tap Nakita ko
--   team          'inventory' / 'owners' when sent to a team (one shared note:
--                 whoever answers closes it for everyone)
--   sender_ids    every account of the person who wrote it (Jas has three), so
--                 the answer pops up on all of them
--   sender_nudged_at  the sender saw "not seen in 2 hours" (so it shows once)

alter table public.staff_tasks
  add column if not exists needs_answer boolean,
  add column if not exists team text,
  add column if not exists sender_ids uuid[],
  add column if not exists sender_nudged_at timestamptz;

create index if not exists staff_tasks_sender_idx on public.staff_tasks using gin (sender_ids) where sender_ids is not null;
create index if not exists staff_tasks_kind_open_idx on public.staff_tasks (kind, status) where kind = 'note';

notify pgrst, 'reload schema';

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'staff_tasks'
  and column_name in ('needs_answer', 'team', 'sender_ids', 'sender_nudged_at');
