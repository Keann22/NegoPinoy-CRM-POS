-- Customer Persona & Profile (owner, 2026-11-25; Phase 1)
-- Stores AI-derived customer personas, buying style, interests, life/business clues,
-- unbought chat inquiries, next-best-action recommendations, and staff verification feedback.
-- Server-only (RLS enabled, no public policies): read and written via /api/customers/profile.

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  psid text,
  persona_type text not null default 'other'
    check (persona_type in ('nanay_home', 'small_negosyo', 'ofw_sender', 'reseller', 'gift_buyer', 'browser_lead', 'other')),
  persona_label text not null,
  summary text not null,
  confidence numeric(4,3) not null default 0.5,
  interests jsonb not null default '[]'::jsonb,
  unbought_inquiries jsonb not null default '[]'::jsonb,
  life_clues jsonb not null default '[]'::jsonb,
  objections_and_pain_points jsonb not null default '[]'::jsonb,
  buying_style jsonb not null default '{}'::jsonb,
  sales_tips jsonb not null default '[]'::jsonb,
  next_action_type text not null default 'check_in'
    check (next_action_type in ('recommend', 'payment_followup', 'restock_alert', 'check_in', 'wait')),
  recommended_items jsonb not null default '[]'::jsonb,
  draft_message text,
  metrics jsonb not null default '{}'::jsonb,
  source_order_count integer not null default 0,
  source_message_count integer not null default 0,
  last_message_at timestamptz,
  model_used text,
  staff_verdict text check (staff_verdict in ('accurate', 'needs_fix')),
  staff_correction_note text,
  staff_verified_by text,
  staff_verified_at timestamptz,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_profiles_persona_idx
  on public.customer_profiles (persona_type);

create index if not exists customer_profiles_next_action_idx
  on public.customer_profiles (next_action_type, generated_at desc);

alter table public.customer_profiles enable row level security;

notify pgrst, 'reload schema';
