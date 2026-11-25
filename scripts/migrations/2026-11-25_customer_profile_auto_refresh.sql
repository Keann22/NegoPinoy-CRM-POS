-- Customer Persona & Profile, phase 2 (owner, 2026-11-25):
-- 1. Dirty-flag columns + triggers on orders, payments, and customer Messenger chats
--    so personas automatically mark themselves stale whenever activity happens.
-- 2. Paginated RPC to list unprofiled customers with orders (prioritizing linked
--    Messenger chats and highest spend first) for full backfill and cron refresh.

alter table public.customer_profiles
  add column if not exists needs_refresh boolean not null default false,
  add column if not exists needs_refresh_reason text,
  add column if not exists needs_refresh_at timestamptz;

create index if not exists customer_profiles_needs_refresh_idx
  on public.customer_profiles (needs_refresh_at asc)
  where needs_refresh = true;

-- Mark profile stale when an order is created or its status/amounts change.
create or replace function public.mark_customer_profile_refresh_on_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null then
    update public.customer_profiles
       set needs_refresh = true,
           needs_refresh_reason = 'order_changed',
           needs_refresh_at = coalesce(needs_refresh_at, now())
     where customer_id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_profile_refresh_order on public.orders;
create trigger trg_customer_profile_refresh_order
  after insert or update of status, balance_due, total_amount on public.orders
  for each row
  execute function public.mark_customer_profile_refresh_on_order();

-- Mark profile stale when a payment is logged on any of the customer's orders.
create or replace function public.mark_customer_profile_refresh_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if new.order_id is not null then
    select o.customer_id into v_customer_id
      from public.orders o
     where o.id = new.order_id;
    if v_customer_id is not null then
      update public.customer_profiles
         set needs_refresh = true,
             needs_refresh_reason = 'payment_logged',
             needs_refresh_at = coalesce(needs_refresh_at, now())
       where customer_id = v_customer_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_profile_refresh_payment on public.payments;
create trigger trg_customer_profile_refresh_payment
  after insert on public.payments
  for each row
  execute function public.mark_customer_profile_refresh_on_payment();

-- Mark profile stale when a customer sends a new Messenger message after 6h or 5+ messages.
create or replace function public.mark_customer_profile_refresh_on_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customer_profiles cp
     set needs_refresh = true,
         needs_refresh_reason = 'new_chat',
         needs_refresh_at = now()
   where cp.needs_refresh = false
     and (
       cp.psid = new.customer_psid
       or cp.customer_id in (select c.id from public.customers c where c.psid = new.customer_psid)
     )
     and (
       cp.generated_at < now() - interval '6 hours'
       or (
         select count(*)
           from public.conversation_logs cl
          where cl.customer_psid = new.customer_psid
       ) - cp.source_message_count >= 5
     );
  return new;
end;
$$;

drop trigger if exists trg_customer_profile_refresh_chat on public.conversation_logs;
create trigger trg_customer_profile_refresh_chat
  after insert on public.conversation_logs
  for each row
  when (new.sender_type = 'customer' and new.customer_psid is not null)
  execute function public.mark_customer_profile_refresh_on_chat();

-- Ordered list of unprofiled customers who have at least one order.
-- Prioritizes customers with a linked Messenger PSID first, then highest spend.
create or replace function public.get_unprofiled_order_customers(p_limit integer default 5000)
returns table (
  customer_id uuid,
  psid text,
  order_count bigint,
  total_spend numeric,
  last_order_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id as customer_id,
    c.psid,
    count(o.id) as order_count,
    coalesce(sum(o.total_amount) filter (where coalesce(o.status, '') not in ('Cancelled', 'Returned')), 0) as total_spend,
    max(coalesce(o.order_date, o.created_at)) as last_order_at
  from public.orders o
  join public.customers c on c.id = o.customer_id
  left join public.customer_profiles cp on cp.customer_id = c.id
  where cp.id is null
  group by c.id, c.psid
  order by
    (c.psid is not null and trim(c.psid) <> '') desc,
    coalesce(sum(o.total_amount) filter (where coalesce(o.status, '') not in ('Cancelled', 'Returned')), 0) desc,
    max(coalesce(o.order_date, o.created_at)) desc
  limit greatest(1, least(coalesce(p_limit, 5000), 10000));
$$;

revoke all on function public.get_unprofiled_order_customers(integer) from public, anon, authenticated;
grant execute on function public.get_unprofiled_order_customers(integer) to service_role;

notify pgrst, 'reload schema';
