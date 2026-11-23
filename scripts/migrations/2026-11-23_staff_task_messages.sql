-- Replies on staff tasks (owner, 2026-11-23): staff can ask a question or reply
-- on a task, and the owners answer there. Staff writing: the owner who assigned
-- it gets a bell. Owners writing: the task pops up again for the staff member.
-- Server only (RLS on, no policies).

create table if not exists public.staff_task_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.staff_tasks(id) on delete cascade,
  author_id uuid,
  author_name text not null,
  -- true = written by an owner (not the person the task is for)
  from_owner boolean not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_task_messages_task_idx on public.staff_task_messages (task_id, created_at);

alter table public.staff_task_messages enable row level security;

-- Unread tracking on the task: who wrote last, and when each side last read.
alter table public.staff_tasks
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_from_owner boolean,
  add column if not exists staff_read_at timestamptz,
  add column if not exists owner_read_at timestamptz;

notify pgrst, 'reload schema';

select count(*) as staff_task_messages from public.staff_task_messages;

-- One task for several people (owner, 2026-11-23): each person gets their own
-- copy (own seen / done); copies made together share a group_id ("2 of 3 done").
alter table public.staff_tasks add column if not exists group_id uuid;
create index if not exists staff_tasks_group_idx on public.staff_tasks (group_id) where group_id is not null;
notify pgrst, 'reload schema';

-- Photo on a reply (owner, 2026-11-23): staff (or owners) can attach a photo.
-- Stored in the public staff-tasks bucket (not confidential).
alter table public.staff_task_messages add column if not exists photo_url text;
notify pgrst, 'reload schema';
