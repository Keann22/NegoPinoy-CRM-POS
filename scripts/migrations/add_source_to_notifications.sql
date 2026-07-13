-- Lets notifications rows be tagged by origin (e.g. 'staff_message' for the
-- manual "Message Staff" feature) so the floating message icon's unread
-- badge can count its own notifications separately from system-generated
-- ones (order packed, issue reported), without sniffing the title text.
alter table public.notifications
  add column if not exists source text;
