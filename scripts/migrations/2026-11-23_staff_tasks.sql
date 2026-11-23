-- Staff tasks (owner, 2026-11-23): the owners assign a task to a staff member
-- ("Jas, pwede na yang ipadala" + the order), instead of a Messenger message.
-- The staff member gets a pop-up until they tap "Nakita ko", then it stays on
-- their dashboard until they tap Done (optional note / photo). The owner who
-- assigned it gets a bell when it's done.
-- Server only (RLS on, no policies): every read and write goes through /api/tasks.

create table if not exists public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  order_id uuid references public.orders(id) on delete set null,
  -- One person can have several accounts (Jas has three): the task shows on all of them.
  assignee_ids uuid[] not null,
  assignee_name text not null,
  assigned_by_id uuid,
  assigned_by_name text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  seen_at timestamptz,
  seen_by_name text,
  done_at timestamptz,
  done_by_name text,
  done_note text,
  done_photo_url text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists staff_tasks_status_idx on public.staff_tasks (status, created_at desc);
create index if not exists staff_tasks_assignee_idx on public.staff_tasks using gin (assignee_ids);
create index if not exists staff_tasks_order_idx on public.staff_tasks (order_id) where order_id is not null;

alter table public.staff_tasks enable row level security;

-- Done photos (e.g. the parcel handed to the courier). Not confidential.
insert into storage.buckets (id, name, public)
values ('staff-tasks', 'staff-tasks', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

select count(*) as staff_tasks from public.staff_tasks;
