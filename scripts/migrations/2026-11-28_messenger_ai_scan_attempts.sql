-- Messenger AI Copilot fixes (2026-11-28): count failed scans per chat message so a
-- burst that keeps failing is given up after 3 tries instead of calling Gemini on
-- every scan. Constant default = instant on PG 11+ (no table rewrite).
alter table public.conversation_logs
  add column if not exists ai_scan_attempts smallint not null default 0;

notify pgrst, 'reload schema';
