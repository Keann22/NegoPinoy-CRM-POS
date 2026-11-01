-- 2026-11-01 (2): lock the Messenger chatbot / knowledge-base tables to logged-in accounts.
--
-- These were left open in 2026-11-01_lock_public_access.sql because the knowledge-base
-- admin dashboard read them with the public key. That dashboard now has a log-in
-- (Owner/Admin), and the chatbot Edge Functions (facebook-webhook, faq-approve, ...) use
-- the service-role key, so nothing needs public access any more.
-- Public access exposed 10,179 Messenger conversations.
-- Undo: grant all on these tables to anon; grant execute on match_knowledge to public, anon.

begin;
revoke all on table public.conversation_logs, public.pending_faqs,
  public.gold_standard_knowledge, public.documents from anon;

do $$
declare f record;
begin
  for f in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'match_knowledge'
  loop
    if has_function_privilege('authenticated', f.oid, 'EXECUTE') then
      execute format('grant execute on function public.match_knowledge(%s) to authenticated', f.args);
    end if;
    execute format('grant execute on function public.match_knowledge(%s) to service_role', f.args);
    execute format('revoke execute on function public.match_knowledge(%s) from public, anon', f.args);
  end loop;
end $$;
commit;
