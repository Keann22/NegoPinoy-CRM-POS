-- Messaging center: per-user thread membership + read state for order_issues
-- threads (order issues, staff messages, and the new 'direct' 1:1 DM threads).
-- is_member marks people shown as "involved" (sender, @mentioned, DM pair);
-- a row with is_member = false is just read-tracking for a viewer.
-- Keyed by auth user id, not display name — names are display-only.
create table if not exists public.thread_participants (
  issue_id uuid not null references public.order_issues(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  is_member boolean not null default false,
  last_read_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);

create index if not exists thread_participants_user_idx
  on public.thread_participants (user_id);
