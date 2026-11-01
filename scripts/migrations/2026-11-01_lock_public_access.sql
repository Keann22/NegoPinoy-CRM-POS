-- 2026-11-01: lock the database to logged-in staff and the server (service-role) key.
--
-- Before this, the public (anon) key — which ships inside the CRM's and website's code —
-- could read AND change customers, orders, payments, purchase orders (with costs), staff
-- messages, and could list/delete payment-proof photos.
--
-- Logged-in staff (authenticated) and the server key keep exactly the access they had.
-- Tables of other apps sharing this project (Group Buy, food_spots, the chatbot / FAQ
-- tables) are NOT changed here.
-- Undo: 2026-11-01_lock_public_access_ROLLBACK.sql

begin;

-- 1. Tables: the public key gets nothing on NegoPinoy tables.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and c.relname not in (
        'groupbuy_batches', 'groupbuy_leaders', 'groupbuy_orders', 'groupbuy_products',
        'food_spots', 'conversation_logs', 'gold_standard_knowledge', 'documents', 'pending_faqs'
      )
  loop
    execute format('revoke all on table public.%I from anon', t.relname);
  end loop;
end $$;

revoke all on all sequences in schema public from anon;

-- 2. What the public may read: the website's product info and the address pickers.
--    Never cost, supplier, shelf location or recipe columns.
grant select on public.categories, public.regions, public.provinces, public.cities, public.barangays to anon;
grant select (
  id, name, category, description, sku, stock_level, images, selling_price, parent_id,
  variant_name, installment_price, is_on_sale, sale_price, ads_price, live_price, is_induction_ready
) on public.products to anon;

-- 3. Functions: the public key can't run NegoPinoy functions. Staff and the server key keep
--    whatever they could run before (much of it came through the PUBLIC grant).
do $$
declare f record;
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.proname not in ('match_knowledge')  -- chatbot
  loop
    if has_function_privilege('authenticated', f.oid, 'EXECUTE') then
      execute format('grant execute on function public.%I(%s) to authenticated', f.proname, f.args);
    end if;
    if has_function_privilege('service_role', f.oid, 'EXECUTE') then
      execute format('grant execute on function public.%I(%s) to service_role', f.proname, f.args);
    end if;
    execute format('revoke execute on function public.%I(%s) from public, anon', f.proname, f.args);
  end loop;
end $$;

-- 4. New tables and functions are not public by default.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- 5. Roles come from app_metadata (server-set), never user_metadata (user-editable).
create or replace function public.get_all_users()
 returns table(id uuid, email character varying, raw_user_meta_data jsonb)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and coalesce((auth.jwt() -> 'app_metadata')::text, '') !~* '"(owner|admin)"' then
    raise exception 'Access Denied';
  end if;
  return query select au.id, au.email, au.raw_user_meta_data from auth.users au;
end;
$function$;
revoke execute on function public.get_all_users() from public, anon;
grant execute on function public.get_all_users() to authenticated, service_role;

-- Not used by the app any more (User Management goes through /api/admin/users).
revoke execute on function public.set_user_roles(uuid, jsonb) from public, anon, authenticated;

alter policy "Management can read all logs" on public.agent_daily_logs
  using (coalesce((auth.jwt() -> 'app_metadata')::text, '') ~* '"(owner|admin)"');

commit;

-- 6. Storage (separate transaction): payment proofs and agent proofs can only be listed,
--    uploaded, changed or deleted by logged-in staff. Direct links to files keep working
--    because the buckets stay public.
begin;
alter policy "Allow public uploads to proof_of_payment" on storage.objects to authenticated
  with check (bucket_id = 'proof_of_payment');
alter policy "Allow public read of proof_of_payment" on storage.objects to authenticated
  using (bucket_id = 'proof_of_payment');
alter policy "Allow public update of proof_of_payment" on storage.objects to authenticated
  using (bucket_id = 'proof_of_payment');
alter policy "Allow public delete of proof_of_payment" on storage.objects to authenticated
  using (bucket_id = 'proof_of_payment');
alter policy "Public Access to agent-proofs" on storage.objects to authenticated
  using (bucket_id = 'agent-proofs');
commit;
