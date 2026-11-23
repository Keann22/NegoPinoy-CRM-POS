-- Staff tasks progress (owner, 2026-11-23): between Seen and Done, staff can say
-- "Ginagawa na" (working on it, optional note) or "May problema" (can't do it,
-- reason required; the owner who assigned it gets a bell).

alter table public.staff_tasks
  add column if not exists progress text check (progress in ('working', 'problem')),
  add column if not exists progress_note text,
  add column if not exists progress_at timestamptz,
  add column if not exists progress_by_name text;

notify pgrst, 'reload schema';

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'staff_tasks' and column_name like 'progress%';
