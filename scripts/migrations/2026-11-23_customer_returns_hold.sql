-- Hold until date on customer_returns (2026-11-23).
-- Lets staff/owners pause a return case until a PH calendar date (e.g. customer
-- asked to re-ship on Dec 3). On that date, the case automatically returns to
-- its active stage (e.g. To do) and sends a bell notification reminder once.

ALTER TABLE public.customer_returns
  ADD COLUMN IF NOT EXISTS hold_until date,
  ADD COLUMN IF NOT EXISTS hold_note text,
  ADD COLUMN IF NOT EXISTS hold_by_name text,
  ADD COLUMN IF NOT EXISTS hold_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_reminded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customer_returns_hold_until
  ON public.customer_returns (hold_until)
  WHERE status = 'open' AND hold_until IS NOT NULL;
