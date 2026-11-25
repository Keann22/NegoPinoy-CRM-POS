-- Task answer buttons (owner, 2026-11-25): "Customer hasn't replied" puts an
-- order task in progress = 'waiting'. The task comes back to the staff member
-- 4 hours later ("Customer replied yet?") and doesn't count as late meanwhile.
-- Applied 2026-11-25 via the Management API.

alter table public.staff_tasks drop constraint if exists staff_tasks_progress_check;
alter table public.staff_tasks
  add constraint staff_tasks_progress_check
  check (progress = any (array['working'::text, 'problem'::text, 'waiting'::text]));

-- Undo (only if no task is waiting):
-- update public.staff_tasks set progress = 'working' where progress = 'waiting';
-- alter table public.staff_tasks drop constraint staff_tasks_progress_check;
-- alter table public.staff_tasks add constraint staff_tasks_progress_check
--   check (progress = any (array['working'::text, 'problem'::text]));
