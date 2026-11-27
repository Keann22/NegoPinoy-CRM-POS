-- Messenger AI Sales Copilot (Phase 2): enable the 4 remaining action types
-- (`bus_shipping_request`, `damage_or_complaint`, `waiting_prompt_reply`, `delivery_or_order_note`).
-- All rules remain in safe `mode = 'stage_confirm'` (Approval First) with
-- `show_sales_popup = FALSE` until owners verify accuracy on /dashboard/approval-queue.

UPDATE public.messenger_ai_action_rules
SET enabled = TRUE,
    updated_at = NOW()
WHERE action_type IN (
  'bus_shipping_request',
  'damage_or_complaint',
  'waiting_prompt_reply',
  'delivery_or_order_note'
);
