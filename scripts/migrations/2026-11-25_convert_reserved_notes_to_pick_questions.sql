-- One-time (2026-11-25): unpicked orders whose notes say reserved / ship on a
-- later date ("*RESERVED", "reserve for December", "NOV21 SHIPPING ONWARDS",
-- "December 13"...) become "Hindi pa ipi-pick" questions for their sales agent:
-- set the ship date (they leave picking until 3 days before) or say pick now.
-- 21 orders; #A02683D left out (its note matched only by accident).
-- Undo: delete from order_pick_skips where converted_from is not null and resolved_at is null;
insert into public.order_pick_skips (order_id, reason, note, created_by_name, converted_from)
select o.id, 'later', left(trim(regexp_replace(o.notes, '\s+', ' ', 'g')), 200), 'System (from order notes)', o.notes
from public.orders o
where o.status in ('Processing', 'Picked (with issue)', 'Pending Payment', 'On-Hold', 'Waiting for Stock')
  and coalesce(o.notes, '') || ' ' || coalesce(o.not_for_shipping_reason, '')
      ~* '(reserve|wag.*muna|next month|december|onwards|ipapadala.*once|nov\s?\d+ shipping|shipping.*(nov|dec)|nov\s?\d+ payment|payment/shipping)'
  and o.id::text not like 'a02683d%'
  and not exists (select 1 from public.order_ship_holds h where h.order_id = o.id and h.released_at is null)
  and not exists (select 1 from public.order_pick_skips s where s.order_id = o.id and s.resolved_at is null)
returning upper(left(order_id::text, 7)) as order_no;
