-- One-time (2026-11-25): the Priority List's old "Hold" (until a date) is gone.
-- When it ran out the order came back to Ready to pack without asking anyone
-- (#ECB5662: held Oct 28 until Nov 6, then 138 days "late"). The 7 open orders
-- with an old hold become "Don't ship yet" holds; sales is asked "Ready to ship?"
-- on the date (today for the ones that already ran out).
-- The old hold events stay in order_priority_events (a hold_cleared row is added).
-- Undo: release the holds below (released_by_name = 'Undo') and clear
-- not_for_shipping_reason on the same orders.
begin;

create temp table conv (short text, kind text, check_on date, grp text, note text, by_name text, at timestamptz) on commit drop;
insert into conv
select x.short, x.kind, x.check_on::date, x.grp, e.note, e.created_by_name, e.created_at
from (values
  ('015eab0', 'adding',      '2026-11-25', null),
  ('ecb5662', 'with_orders', '2026-11-25', 'ecb5662'),
  ('c1b47d8', 'with_orders', '2026-11-25', 'ecb5662'),
  ('6ddf728', 'with_orders', '2026-11-25', 'ecb5662'),
  ('e911672', 'payment',     '2026-11-25', null),
  ('c4c2a82', 'with_orders', '2026-11-30', 'c4c2a82'),
  ('e7b12d2', 'with_orders', '2026-11-30', 'c4c2a82'),
  ('d1ad92b', 'adding',      '2026-11-30', null),
  ('7ba499f', 'payment',     '2026-12-01', null)
) x(short, kind, check_on, grp)
-- Note and who held it come from the main order's old hold.
join lateral (
  select note, created_by_name, created_at from order_priority_events
  where kind = 'hold' and left(order_id::text, 7) = coalesce(x.grp, x.short)
  order by created_at desc limit 1
) e on true;

create temp table grp_ids on commit drop as
select grp, gen_random_uuid() group_id from (select distinct grp from conv where grp is not null) d;

create temp table todo on commit drop as
select o.id, c.*, g.group_id,
  -- Same text the hold dialog writes (holdText in ship-hold-service.ts).
  case c.kind
    when 'with_orders' then 'Ships with ' || (
      select string_agg('#' || upper(c2.short), ', ' order by c2.short) from conv c2 where c2.grp = c.grp and c2.short <> c.short)
    when 'adding' then 'Customer will add more'
    when 'payment' then 'Waiting for payment'
  end || ': ' || c.note reason
from conv c
join orders o on left(o.id::text, 7) = c.short
left join grp_ids g on g.grp = c.grp
where o.status in ('Pending Payment','Processing','Picked','Picked (with issue)','Photo','Packed','For Shipping','On-Hold','Waiting for Stock')
  and not exists (select 1 from order_ship_holds s where s.order_id = o.id and s.released_at is null);

update orders o set not_for_shipping_reason = t.reason from todo t where o.id = t.id;

insert into order_ship_holds (order_id, group_id, kind, ship_via, note, check_on, created_by_name, created_at, converted_from)
select id, group_id, kind, 'courier', note, check_on, by_name, at, 'Priority List hold: ' || note from todo;

-- End every open old hold (incl. #0F23080, which already has a newer hold).
insert into order_priority_events (order_id, kind, note, created_by_name)
select h.order_id, 'hold_cleared', 'Moved to Don''t ship yet (2026-11-25)', 'System'
from (
  select distinct on (order_id) order_id, kind from order_priority_events
  where kind in ('hold', 'hold_cleared') order by order_id, created_at desc
) h
where h.kind = 'hold';

select upper(t.short) id, t.kind, t.check_on, t.reason from todo t order by t.grp nulls last, t.short;
commit;
