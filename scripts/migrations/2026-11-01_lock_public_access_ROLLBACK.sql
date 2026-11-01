-- Undo 2026-11-01_lock_public_access.sql (re-opens the public key). Emergency use only.
begin;
grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;
grant execute on all functions in schema public to public, anon;
alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant execute on functions to public, anon;
alter policy "Management can read all logs" on public.agent_daily_logs
  using ((((auth.jwt() -> 'user_metadata') ->> 'role') ~~* '%Owner%') or (((auth.jwt() -> 'user_metadata') ->> 'role') ~~* '%Admin%'));
commit;
begin;
alter policy "Allow public uploads to proof_of_payment" on storage.objects to public with check (bucket_id = 'proof_of_payment');
alter policy "Allow public read of proof_of_payment" on storage.objects to public using (bucket_id = 'proof_of_payment');
alter policy "Allow public update of proof_of_payment" on storage.objects to public using (bucket_id = 'proof_of_payment');
alter policy "Allow public delete of proof_of_payment" on storage.objects to public using (bucket_id = 'proof_of_payment');
alter policy "Public Access to agent-proofs" on storage.objects to public using (bucket_id = 'agent-proofs');
commit;
