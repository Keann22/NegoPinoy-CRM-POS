-- Answer to an order note pops up for the sender right away (owner, 2026-11-25).
-- Before: the sender's app checked every 3 minutes. Now, when the person a note
-- was sent to answers it (a reply, or Done), this trigger sends a Realtime
-- broadcast to each sender account on topic "staff-tasks:<user id>"; the app
-- (src/hooks/useStaffTasks.ts) reloads its tasks when it hears one.
-- The broadcast carries no content (payload {}), only "something changed".
--
-- Undo:
--   drop trigger if exists staff_tasks_note_answer_ping on public.staff_tasks;
--   drop function if exists public.staff_tasks_note_answer_ping();

create or replace function public.staff_tasks_note_answer_ping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if new.kind is distinct from 'note' then
    return new;
  end if;
  if (new.last_message_at is distinct from old.last_message_at and new.last_message_from_owner = false)
     or (new.status = 'done' and old.status is distinct from 'done') then
    foreach uid in array coalesce(new.sender_ids, '{}'::uuid[]) loop
      begin
        perform realtime.send('{}'::jsonb, 'changed', 'staff-tasks:' || uid::text, false);
      exception when others then
        null; -- a failed ping must never block the answer; the 3-minute check still runs
      end;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_tasks_note_answer_ping on public.staff_tasks;
create trigger staff_tasks_note_answer_ping
  after update on public.staff_tasks
  for each row execute function public.staff_tasks_note_answer_ping();
