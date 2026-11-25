-- Tasks and notes pop up right away (owner, 2026-11-25). Replaces the
-- note-answer-only ping (2026-11-25_note_answer_realtime_ping.sql).
--
-- On every new staff_tasks row (task, note, auto put-back task) and every change
-- to one (seen, working on it, problem, reply, done, new deadline, cancelled,
-- withdrawn), each account the row is for (assignee_ids) and each account that
-- sent it (sender_ids, notes only) gets a Realtime broadcast on topic
-- "staff-tasks:<user id>". The app (src/hooks/useStaffTasks.ts) reloads its
-- tasks when it hears one, so the pop-up shows within seconds instead of at the
-- next 3-minute check. The broadcast carries no content (payload {}).
-- Loading tasks never writes to staff_tasks, so a ping can't cause a loop.
--
-- Undo (back to the 3-minute check only):
--   drop trigger if exists staff_tasks_live_ping on public.staff_tasks;
--   drop function if exists public.staff_tasks_live_ping();

drop trigger if exists staff_tasks_note_answer_ping on public.staff_tasks;
drop function if exists public.staff_tasks_note_answer_ping();

create or replace function public.staff_tasks_live_ping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  for uid in
    select distinct u from unnest(
      coalesce(new.assignee_ids, '{}'::uuid[])
      || coalesce(new.sender_ids, '{}'::uuid[])
      || case when tg_op = 'UPDATE' then coalesce(old.assignee_ids, '{}'::uuid[]) else '{}'::uuid[] end
    ) as u
  loop
    begin
      perform realtime.send('{}'::jsonb, 'changed', 'staff-tasks:' || uid::text, false);
    exception when others then
      null; -- a failed ping must never block saving the task; the 3-minute check still runs
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists staff_tasks_live_ping on public.staff_tasks;
create trigger staff_tasks_live_ping
  after insert or update on public.staff_tasks
  for each row execute function public.staff_tasks_live_ping();
