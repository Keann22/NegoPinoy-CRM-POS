-- Recount requests: Telegram to the owner when Jas finishes a batch, and a noon
-- reminder when she hasn't finished by the due date.

alter table public.recount_requests add column if not exists due_date date;               -- first day the noon reminder may fire (PH date)
alter table public.recount_requests add column if not exists system_before integer;       -- system number just before Jas's count
alter table public.recount_requests add column if not exists done_notified_at timestamptz; -- "finished" Telegram sent for this batch
alter table public.recount_requests add column if not exists last_reminded_on date;       -- last noon reminder (PH date)

-- First batch (Oct 31): Jas counts on Tuesday, Nov 3 (Nov 1 day off, Nov 2 holiday).
update public.recount_requests set due_date = '2026-11-03' where due_date is null;

notify pgrst, 'reload schema';

select count(*) filter (where due_date = '2026-11-03') as due_tuesday, count(*) as total from public.recount_requests;
