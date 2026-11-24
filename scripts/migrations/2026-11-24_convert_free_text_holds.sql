-- One-time (2026-11-24): turn free-text not-for-shipping notes into structured
-- holds. Bus-marked ones ("BUS SHIPPING: ...") stay with Bus Shipping.
-- Backup of every note: scripts/reports/2026-11-24-ship-hold-conversion-backup.json
begin;

create temp table conv on commit drop as
select o.id, o.customer_id, o.not_for_shipping_reason r,
  case
    when o.not_for_shipping_reason ~* '(sabay|isasabay|ibang item|ibang order|other order|kasama)' then 'with_orders'
    when o.not_for_shipping_reason ~* '(add)' then 'adding'
    when o.not_for_shipping_reason ~* '(bayad|payment|gcash|sahod|paid|full pay|layaway|lay-away| dp)' then 'payment'
    when o.not_for_shipping_reason ~* '(nov|dec|jan|katapusan|next week|week)' then 'date'
    else 'other' end kind,
  case when o.not_for_shipping_reason ~* 'bus' then 'bus' else 'courier' end via,
  case when o.not_for_shipping_reason ~* 'dec' then date '2026-12-01' else date '2026-11-24' end check_on,
  l.user_name, l.created_at log_at
from orders o
left join lateral (
  select user_name, created_at from order_logs
  where order_id = o.id and status = 'Marked Not Ready to Ship' order by created_at desc limit 1
) l on true
where coalesce(o.not_for_shipping_reason,'') <> '' and o.not_for_shipping_reason !~* '^BUS SHIPPING'
  and o.status in ('Pending Payment','Processing','Picked','Picked (with issue)','Photo','Packed','For Shipping','On-Hold','Waiting for Stock')
  and not exists (select 1 from order_ship_holds s where s.order_id = o.id and s.released_at is null);

alter table conv add column group_id uuid;
update conv set group_id = gen_random_uuid() where kind = 'with_orders';

-- Ship-together: the customer's other open orders with no note of their own.
create temp table conv_sib on commit drop as
select c.id main_id, c.group_id, s.id sib_id
from conv c
join orders s on s.customer_id = c.customer_id and s.id <> c.id
where c.kind = 'with_orders'
  and coalesce(s.not_for_shipping_reason,'') = ''
  and s.status in ('Pending Payment','Processing','Picked','Picked (with issue)','Photo','Packed','For Shipping','On-Hold','Waiting for Stock');

-- A ship-together hold with nobody to wait for is just "other".
update conv set kind = 'other', group_id = null
where kind = 'with_orders' and not exists (select 1 from conv_sib x where x.main_id = conv.id);

insert into order_ship_holds (order_id, group_id, kind, ship_via, note, check_on, created_by_name, created_at, converted_from)
select id, group_id, kind, via, r, check_on, coalesce(user_name, 'Old hold'), coalesce(log_at, now()), r from conv;

insert into order_ship_holds (order_id, group_id, kind, ship_via, note, check_on, created_by_name, created_at, converted_from)
select x.sib_id, x.group_id, 'with_orders', c.via, c.r, c.check_on, coalesce(c.user_name, 'Old hold'), coalesce(c.log_at, now()), null
from conv_sib x join conv c on c.id = x.main_id;

update orders o set not_for_shipping_reason = 'Isasabay sa #' || upper(left(x.main_id::text, 7)) || coalesce(case when c.via = 'bus' then ' (bus)' end, '') || ': ' || c.r
from conv_sib x join conv c on c.id = x.main_id
where o.id = x.sib_id;

select c.kind, count(*) n, (select count(*) from conv_sib) siblings from conv c group by c.kind order by c.kind;
commit;
