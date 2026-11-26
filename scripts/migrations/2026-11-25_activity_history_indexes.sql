-- Non-breaking read indexes for staff activity history queries (2026-11-25)
CREATE INDEX IF NOT EXISTS idx_order_logs_created_at
  ON public.order_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_issues_created_at
  ON public.order_issues (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_at
  ON public.stock_transfers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_return_events_created_at
  ON public.customer_return_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_task_messages_created_at
  ON public.staff_task_messages (created_at DESC);
