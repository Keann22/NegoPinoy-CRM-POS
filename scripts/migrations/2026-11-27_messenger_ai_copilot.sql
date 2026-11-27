-- Messenger AI Sales Copilot (Phase 1, 2026-11-27)
-- Native Next.js + Supabase + Gemini pipeline (zero n8n, zero Meta auto-send).
-- Every rule starts in `stage_confirm` (Approval First) with `show_sales_popup = false`
-- so owners can test/tune on /dashboard/approval-queue before turning on the sales pop-up.

create table if not exists public.messenger_ai_action_rules (
  action_type text primary key,
  label text not null,
  phase integer not null default 1,
  mode text not null default 'stage_confirm' check (mode in ('stage_confirm', 'auto_apply')),
  enabled boolean not null default true,
  show_sales_popup boolean not null default false,
  min_confidence numeric(4,3) not null default 0.72,
  updated_at timestamptz not null default now(),
  updated_by_name text
);

insert into public.messenger_ai_action_rules (action_type, label, phase, mode, enabled, show_sales_popup, min_confidence)
values
  ('order_edit_items', 'Order Edit / Add-on / New Order', 1, 'stage_confirm', true, false, 0.75),
  ('order_hold_or_reschedule', 'Hold / Reschedule / Combine Shipping', 1, 'stage_confirm', true, false, 0.72),
  ('order_cancel', 'Order Cancellation', 1, 'stage_confirm', true, false, 0.80),
  ('payment_proof', 'GCash / Bank Payment Proof', 1, 'stage_confirm', true, false, 0.72),
  ('payment_promise', 'Payment Promise / Follow-up Date', 1, 'stage_confirm', true, false, 0.70),
  ('bus_shipping_request', 'Bus Shipping Request', 2, 'stage_confirm', false, false, 0.75),
  ('damage_or_complaint', 'Damage / Return Case', 2, 'stage_confirm', false, false, 0.75),
  ('waiting_prompt_reply', 'Reply to Waiting Prompt (RTS / Supplier / Hold)', 2, 'stage_confirm', false, false, 0.75),
  ('delivery_or_order_note', 'Delivery / Receiver Note', 2, 'stage_confirm', false, false, 0.72)
on conflict (action_type) do nothing;

create table if not exists public.messenger_ai_actions (
  id uuid primary key default gen_random_uuid(),
  psid text not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  order_id uuid references public.orders(id) on delete set null,
  source_log_ids uuid[] not null default '{}',
  chat_excerpt text not null,
  attachment_url text,
  action_type text not null,
  execution_mode text not null default 'stage_confirm' check (execution_mode in ('stage_confirm', 'auto_apply')),
  confidence numeric(4,3) not null default 0.5,
  ambiguous_order boolean not null default false,
  ai_reasoning text not null,
  summary_taglish text not null,
  draft_reply text,
  before_snapshot jsonb not null default '{}'::jsonb,
  proposed_payload jsonb not null default '{}'::jsonb,
  final_payload jsonb,
  open_orders_snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'pending_confirm'
    check (status in ('pending_confirm', 'auto_applied_pending_check', 'confirmed', 'edited_and_applied', 'rejected', 'undone', 'auto_superseded')),
  assignee_ids uuid[] not null default '{}',
  assignee_name text,
  verdict text check (verdict in ('correct', 'edited', 'rejected')),
  error_category text,
  diff_fields text[],
  staff_note text,
  applied_summary text,
  reviewed_by_id uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messenger_ai_actions_status_idx on public.messenger_ai_actions (status, created_at desc);
create index if not exists messenger_ai_actions_psid_idx on public.messenger_ai_actions (psid, created_at desc);
create index if not exists messenger_ai_actions_assignee_idx on public.messenger_ai_actions using gin (assignee_ids);
create index if not exists messenger_ai_actions_accuracy_idx on public.messenger_ai_actions (action_type, verdict);

create table if not exists public.messenger_ai_feedback_lessons (
  id uuid primary key default gen_random_uuid(),
  action_id uuid references public.messenger_ai_actions(id) on delete set null,
  action_type text not null,
  verdict text not null check (verdict in ('edited', 'rejected')),
  error_category text,
  chat_excerpt text not null,
  what_ai_did jsonb not null default '{}'::jsonb,
  what_was_right jsonb not null default '{}'::jsonb,
  lesson_text text not null,
  active boolean not null default true,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists messenger_ai_lessons_active_idx
  on public.messenger_ai_feedback_lessons (active, action_type, created_at desc);

create table if not exists public.messenger_product_aliases (
  id uuid primary key default gen_random_uuid(),
  phrase_normalized text not null unique,
  product_id uuid not null references public.products(id) on delete cascade,
  product_name text not null,
  source text not null default 'staff_correction' check (source in ('staff_correction', 'confirmed_ai', 'manual')),
  hit_count integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.conversation_logs
  add column if not exists ai_analyzed_at timestamptz;

create index if not exists conversation_logs_ai_unanalyzed_idx
  on public.conversation_logs (customer_psid, created_at desc)
  where sender_type = 'customer' and ai_analyzed_at is null;

alter table public.messenger_ai_action_rules enable row level security;
alter table public.messenger_ai_actions enable row level security;
alter table public.messenger_ai_feedback_lessons enable row level security;
alter table public.messenger_product_aliases enable row level security;

notify pgrst, 'reload schema';
