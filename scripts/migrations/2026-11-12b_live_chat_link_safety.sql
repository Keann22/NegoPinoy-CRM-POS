-- 2026-11-12b: Make "Connect Live Chat" safe. Replaces the functions from
-- 2026-11-12_connect_live_chat_customers.sql.
-- Paste this whole script into the Supabase Dashboard SQL Editor and click "Run".
--
-- What changes:
-- 1. link_chat_psid_to_customer refuses:
--    - TARGET_HAS_OTHER_CHAT: the account is already connected to another Messenger
--      chat (before, that chat's whole history was silently moved and its PSID lost).
--    - ACCOUNT_MERGE_REQUIRED: the Messenger contact already has its own orders /
--      store credit / carryovers / bus shipments. Staff must confirm the merge
--      (p_merge_accounts = true) after seeing what will move.
--    Store credit is no longer counted twice, the emptied record is deleted, and
--    email / Facebook link / birthday / legacy spend are carried over.
-- 2. Every link is written to customer_merges (who, when, what moved) and can be
--    undone with unlink_chat_psid_from_customer.
-- 3. "Not the same person" is saved in chat_match_dismissals, so every device and
--    the Messenger webhook stop suggesting / auto-linking that pair.
-- 4. Matchers report phone_match and name_match separately, so callers can
--    auto-link only when BOTH phone and name agree.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  psid text NOT NULL,
  target_customer_id uuid NOT NULL,
  source_customer_id uuid,
  method text NOT NULL DEFAULT 'manual',      -- 'manual' | 'auto_phone_name' | 'new_customer'
  merged_accounts boolean NOT NULL DEFAULT false,
  target_before jsonb,
  source_before jsonb,
  moved jsonb NOT NULL DEFAULT '{}'::jsonb,    -- { orders: [...], store_credit_entries: [...], ... }
  linked_by uuid,
  undone_at timestamptz,
  undone_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_merges_psid_idx ON public.customer_merges (psid, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_merges_target_idx ON public.customer_merges (target_customer_id);

ALTER TABLE public.customer_merges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view customer merges" ON public.customer_merges;
CREATE POLICY "Staff can view customer merges"
  ON public.customer_merges FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.customer_merges TO authenticated;

CREATE TABLE IF NOT EXISTS public.chat_match_dismissals (
  psid text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (psid, customer_id)
);

ALTER TABLE public.chat_match_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view chat match dismissals" ON public.chat_match_dismissals;
CREATE POLICY "Staff can view chat match dismissals"
  ON public.chat_match_dismissals FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff can add chat match dismissals" ON public.chat_match_dismissals;
CREATE POLICY "Staff can add chat match dismissals"
  ON public.chat_match_dismissals FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT, INSERT ON public.chat_match_dismissals TO authenticated;

-- ---------------------------------------------------------------------------
-- Link (merge) a Messenger PSID into a customer account
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.link_chat_psid_to_customer(text, uuid);

CREATE OR REPLACE FUNCTION public.link_chat_psid_to_customer(
  p_psid text,
  p_customer_id uuid,
  p_merge_accounts boolean DEFAULT false,
  p_method text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.customers%ROWTYPE;
  v_target_before jsonb;
  v_chat public.customers%ROWTYPE;
  v_has_chat boolean := false;
  v_orders uuid[];
  v_entries uuid[];
  v_carry uuid[];
  v_emails uuid[];
  v_bus uuid[];
  v_bus_req uuid[];
  v_log_ids uuid[];
  v_chat_credit numeric := 0;
  v_chat_legacy numeric := 0;
  v_calc_spend numeric := 0;
  v_mobile text;
  v_take_address boolean := false;
  v_merged boolean := false;
BEGIN
  IF p_psid IS NULL OR TRIM(p_psid) = '' OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Both p_psid and p_customer_id are required';
  END IF;

  -- Server callers (the Messenger webhook, no logged-in user) must say how they matched.
  -- Blocks the old webhook version that auto-linked on a name alone.
  IF auth.uid() IS NULL AND COALESCE(p_method, 'manual') = 'manual' THEN
    RAISE EXCEPTION 'AUTO_LINK_NEEDS_METHOD: automatic links must pass p_method';
  END IF;

  SELECT * INTO v_target FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer account % not found', p_customer_id;
  END IF;

  v_target_before := to_jsonb(v_target);

  IF v_target.psid = p_psid THEN
    RETURN to_jsonb(v_target);  -- already linked
  END IF;

  IF v_target.psid IS NOT NULL AND TRIM(v_target.psid) <> '' THEN
    RAISE EXCEPTION 'TARGET_HAS_OTHER_CHAT: % is already connected to another Messenger chat. Disconnect it first.',
      COALESCE(v_target.full_name, 'This account')
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_chat FROM public.customers WHERE psid = p_psid FOR UPDATE;
  v_has_chat := FOUND;

  IF v_has_chat THEN
    SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_orders FROM public.orders WHERE customer_id = v_chat.id;
    SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_entries FROM public.store_credit_entries WHERE customer_id = v_chat.id;
    SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_carry FROM public.customer_carryovers WHERE customer_id = v_chat.id;
    SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_emails FROM public.customer_email_logs WHERE customer_id = v_chat.id;
    SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_bus FROM public.bus_shipments WHERE customer_id = v_chat.id;
    SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_bus_req FROM public.bus_ship_requests WHERE customer_id = v_chat.id;
    v_chat_credit := COALESCE(v_chat.store_credit, 0);
    v_chat_legacy := COALESCE(v_chat.legacy_spend, 0);

    v_merged := CARDINALITY(v_orders) > 0 OR CARDINALITY(v_carry) > 0 OR CARDINALITY(v_bus) > 0
      OR CARDINALITY(v_bus_req) > 0 OR ABS(v_chat_credit) > 0.009;

    IF v_merged AND NOT p_merge_accounts THEN
      RAISE EXCEPTION 'ACCOUNT_MERGE_REQUIRED: This Messenger contact already has its own account'
        USING ERRCODE = 'P0001',
              DETAIL = jsonb_build_object(
                'name', v_chat.full_name,
                'orders', CARDINALITY(v_orders),
                'store_credit', v_chat_credit,
                'carryovers', CARDINALITY(v_carry),
                'bus_shipments', CARDINALITY(v_bus) + CARDINALITY(v_bus_req)
              )::text;
    END IF;

    -- Move everything the Messenger record owns onto the account
    UPDATE public.orders SET customer_id = p_customer_id WHERE id = ANY(v_orders);
    UPDATE public.store_credit_entries SET customer_id = p_customer_id WHERE id = ANY(v_entries);
    UPDATE public.customer_carryovers SET customer_id = p_customer_id WHERE id = ANY(v_carry);
    UPDATE public.customer_email_logs SET customer_id = p_customer_id WHERE id = ANY(v_emails);
    UPDATE public.bus_shipments SET customer_id = p_customer_id WHERE id = ANY(v_bus);
    UPDATE public.bus_ship_requests SET customer_id = p_customer_id WHERE id = ANY(v_bus_req);

    -- conversation_logs.customer_psid references customers.psid: detach, move the PSID, reattach
    SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_log_ids FROM public.conversation_logs WHERE customer_psid = p_psid;
    UPDATE public.conversation_logs SET customer_psid = NULL WHERE id = ANY(v_log_ids);
    UPDATE public.customers SET psid = NULL, mobile_number = NULL, store_credit = 0 WHERE id = v_chat.id;
  END IF;

  -- Mobile: keep the account's; take the chat's only if the account has none and nobody else uses it
  v_mobile := NULLIF(TRIM(v_target.mobile_number), '');
  IF v_mobile IS NULL AND v_has_chat AND NULLIF(TRIM(v_chat.mobile_number), '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.customers WHERE mobile_number = v_chat.mobile_number AND id <> p_customer_id) THEN
    v_mobile := v_chat.mobile_number;
  END IF;

  v_take_address := v_has_chat
    AND NULLIF(TRIM(v_target.address_line), '') IS NULL AND NULLIF(TRIM(v_target.city), '') IS NULL
    AND (NULLIF(TRIM(v_chat.address_line), '') IS NOT NULL OR NULLIF(TRIM(v_chat.city), '') IS NOT NULL);

  SELECT COALESCE(SUM(total_amount), 0) INTO v_calc_spend
  FROM public.orders
  WHERE customer_id = p_customer_id AND COALESCE(status, '') NOT IN ('Cancelled', 'Returned');

  UPDATE public.customers SET
    psid = p_psid,
    full_name = COALESCE(NULLIF(TRIM(v_target.full_name), ''), NULLIF(TRIM(v_chat.full_name), '')),
    mobile_number = v_mobile,
    email = COALESCE(NULLIF(TRIM(v_target.email), ''), NULLIF(TRIM(v_chat.email), '')),
    facebook_profile_link = COALESCE(NULLIF(TRIM(v_target.facebook_profile_link), ''), NULLIF(TRIM(v_chat.facebook_profile_link), '')),
    birthday_month = COALESCE(v_target.birthday_month, v_chat.birthday_month),
    birthday_day = CASE WHEN v_target.birthday_month IS NOT NULL THEN v_target.birthday_day ELSE v_chat.birthday_day END,
    stove_type = COALESCE(v_target.stove_type, v_chat.stove_type),
    family_size = COALESCE(v_target.family_size, v_chat.family_size),
    specialty_cuisine = COALESCE(v_target.specialty_cuisine, v_chat.specialty_cuisine),
    preferred_payment = COALESCE(v_target.preferred_payment, v_chat.preferred_payment),
    preferred_honorific = COALESCE(v_target.preferred_honorific, v_chat.preferred_honorific),
    location_city = COALESCE(v_target.location_city, v_chat.location_city),
    location_barangay = COALESCE(v_target.location_barangay, v_chat.location_barangay),
    pain_points = COALESCE(v_target.pain_points, v_chat.pain_points),
    ai_summary_notes = CASE
      WHEN v_target.ai_summary_notes IS NOT NULL AND v_chat.ai_summary_notes IS NOT NULL
           AND v_target.ai_summary_notes <> v_chat.ai_summary_notes
      THEN v_target.ai_summary_notes || E'\n' || v_chat.ai_summary_notes
      ELSE COALESCE(v_target.ai_summary_notes, v_chat.ai_summary_notes)
    END,
    address_line = CASE WHEN v_take_address THEN v_chat.address_line ELSE v_target.address_line END,
    region = CASE WHEN v_take_address THEN v_chat.region ELSE v_target.region END,
    province = CASE WHEN v_take_address THEN v_chat.province ELSE v_target.province END,
    city = CASE WHEN v_take_address THEN v_chat.city ELSE v_target.city END,
    barangay = CASE WHEN v_take_address THEN v_chat.barangay ELSE v_target.barangay END,
    postal_code = CASE WHEN v_take_address THEN v_chat.postal_code ELSE v_target.postal_code END,
    street_address = CASE WHEN v_take_address THEN v_chat.street_address ELSE v_target.street_address END,
    legacy_spend = CASE WHEN v_target.legacy_spend IS NULL AND v_chat_legacy = 0 THEN NULL
                        ELSE COALESCE(v_target.legacy_spend, 0) + v_chat_legacy END,
    total_lifetime_spend = GREATEST(COALESCE(v_target.total_lifetime_spend, 0), v_calc_spend),
    store_credit = COALESCE(v_target.store_credit, 0) + v_chat_credit
  WHERE id = p_customer_id
  RETURNING * INTO v_target;

  IF v_has_chat THEN
    UPDATE public.conversation_logs
    SET customer_psid = p_psid,
        customer_name = COALESCE(v_target.full_name, customer_name)
    WHERE id = ANY(v_log_ids);

    IF ABS(v_chat_credit) > 0.009 THEN
      INSERT INTO public.store_credit_entries (customer_id, amount, balance_after, reason, created_by_name)
      VALUES (p_customer_id, 0, v_target.store_credit, 'account_merge',
              'Merged ' || COALESCE(v_chat.full_name, 'Messenger contact') || ' (₱' || v_chat_credit || ' credit)');
    END IF;

    -- The emptied Messenger record is no longer needed
    BEGIN
      DELETE FROM public.customers WHERE id = v_chat.id;
    EXCEPTION WHEN foreign_key_violation THEN
      UPDATE public.customers SET full_name = NULL, address_line = NULL WHERE id = v_chat.id;
    END;
  END IF;

  INSERT INTO public.customer_merges (
    psid, target_customer_id, source_customer_id, method, merged_accounts,
    target_before, source_before, moved, linked_by
  ) VALUES (
    p_psid, p_customer_id, CASE WHEN v_has_chat THEN v_chat.id END, COALESCE(p_method, 'manual'), v_merged,
    v_target_before,
    CASE WHEN v_has_chat THEN to_jsonb(v_chat) END,
    jsonb_build_object(
      'orders', to_jsonb(COALESCE(v_orders, '{}')),
      'store_credit_entries', to_jsonb(COALESCE(v_entries, '{}')),
      'customer_carryovers', to_jsonb(COALESCE(v_carry, '{}')),
      'customer_email_logs', to_jsonb(COALESCE(v_emails, '{}')),
      'bus_shipments', to_jsonb(COALESCE(v_bus, '{}')),
      'bus_ship_requests', to_jsonb(COALESCE(v_bus_req, '{}')),
      'store_credit', v_chat_credit,
      'legacy_spend', v_chat_legacy
    ),
    auth.uid()
  );

  RETURN to_jsonb(v_target);
END;
$$;

-- ---------------------------------------------------------------------------
-- Undo a link: give the Messenger chat back its own record and move back what
-- the link moved. Fields the link only filled in are restored when nobody has
-- changed them since. Orders made after linking stay on the account.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unlink_chat_psid_from_customer(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.customers%ROWTYPE;
  v_psid text;
  v_merge public.customer_merges%ROWTYPE;
  v_has_merge boolean := false;
  tb public.customers%ROWTYPE;
  sb public.customers%ROWTYPE;
  v_log_ids uuid[];
  v_credit numeric := 0;
  v_legacy numeric := 0;
  v_source_id uuid;
  v_source_name text;
BEGIN
  SELECT * INTO v_target FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer account % not found', p_customer_id;
  END IF;
  IF v_target.psid IS NULL OR TRIM(v_target.psid) = '' THEN
    RAISE EXCEPTION 'NOT_LINKED: This account is not connected to a Messenger chat';
  END IF;
  v_psid := v_target.psid;

  SELECT * INTO v_merge FROM public.customer_merges
  WHERE psid = v_psid AND target_customer_id = p_customer_id AND undone_at IS NULL
  ORDER BY created_at DESC LIMIT 1;
  v_has_merge := FOUND;

  SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_log_ids FROM public.conversation_logs WHERE customer_psid = v_psid;
  UPDATE public.conversation_logs SET customer_psid = NULL WHERE id = ANY(v_log_ids);

  IF v_has_merge AND v_merge.target_before IS NOT NULL THEN
    tb := jsonb_populate_record(NULL::public.customers, v_merge.target_before);
    IF v_merge.source_before IS NOT NULL THEN
      sb := jsonb_populate_record(NULL::public.customers, v_merge.source_before);
    END IF;
    v_credit := COALESCE((v_merge.moved->>'store_credit')::numeric, 0);
    v_legacy := COALESCE((v_merge.moved->>'legacy_spend')::numeric, 0);

    UPDATE public.customers c SET
      psid = NULL,
      full_name = CASE WHEN NULLIF(TRIM(tb.full_name), '') IS NULL AND c.full_name IS NOT DISTINCT FROM sb.full_name THEN tb.full_name ELSE c.full_name END,
      mobile_number = CASE WHEN NULLIF(TRIM(tb.mobile_number), '') IS NULL AND c.mobile_number IS NOT DISTINCT FROM sb.mobile_number THEN tb.mobile_number ELSE c.mobile_number END,
      email = CASE WHEN NULLIF(TRIM(tb.email), '') IS NULL AND c.email IS NOT DISTINCT FROM sb.email THEN tb.email ELSE c.email END,
      facebook_profile_link = CASE WHEN NULLIF(TRIM(tb.facebook_profile_link), '') IS NULL AND c.facebook_profile_link IS NOT DISTINCT FROM sb.facebook_profile_link THEN tb.facebook_profile_link ELSE c.facebook_profile_link END,
      birthday_month = CASE WHEN tb.birthday_month IS NULL AND c.birthday_month IS NOT DISTINCT FROM sb.birthday_month THEN NULL ELSE c.birthday_month END,
      birthday_day = CASE WHEN tb.birthday_month IS NULL AND c.birthday_day IS NOT DISTINCT FROM sb.birthday_day THEN tb.birthday_day ELSE c.birthday_day END,
      stove_type = CASE WHEN tb.stove_type IS NULL AND c.stove_type IS NOT DISTINCT FROM sb.stove_type THEN NULL ELSE c.stove_type END,
      family_size = CASE WHEN tb.family_size IS NULL AND c.family_size IS NOT DISTINCT FROM sb.family_size THEN NULL ELSE c.family_size END,
      specialty_cuisine = CASE WHEN tb.specialty_cuisine IS NULL AND c.specialty_cuisine IS NOT DISTINCT FROM sb.specialty_cuisine THEN NULL ELSE c.specialty_cuisine END,
      preferred_payment = CASE WHEN tb.preferred_payment IS NULL AND c.preferred_payment IS NOT DISTINCT FROM sb.preferred_payment THEN NULL ELSE c.preferred_payment END,
      preferred_honorific = CASE WHEN tb.preferred_honorific IS NULL AND c.preferred_honorific IS NOT DISTINCT FROM sb.preferred_honorific THEN NULL ELSE c.preferred_honorific END,
      location_city = CASE WHEN tb.location_city IS NULL AND c.location_city IS NOT DISTINCT FROM sb.location_city THEN NULL ELSE c.location_city END,
      location_barangay = CASE WHEN tb.location_barangay IS NULL AND c.location_barangay IS NOT DISTINCT FROM sb.location_barangay THEN NULL ELSE c.location_barangay END,
      pain_points = CASE WHEN tb.pain_points IS NULL AND c.pain_points IS NOT DISTINCT FROM sb.pain_points THEN NULL ELSE c.pain_points END,
      ai_summary_notes = CASE
        WHEN tb.ai_summary_notes IS NOT NULL AND sb.ai_summary_notes IS NOT NULL
             AND c.ai_summary_notes = tb.ai_summary_notes || E'\n' || sb.ai_summary_notes THEN tb.ai_summary_notes
        WHEN tb.ai_summary_notes IS NULL AND c.ai_summary_notes IS NOT DISTINCT FROM sb.ai_summary_notes THEN NULL
        ELSE c.ai_summary_notes END,
      address_line = CASE WHEN NULLIF(TRIM(tb.address_line), '') IS NULL AND NULLIF(TRIM(tb.city), '') IS NULL
                          AND c.address_line IS NOT DISTINCT FROM sb.address_line AND c.city IS NOT DISTINCT FROM sb.city
                          THEN tb.address_line ELSE c.address_line END,
      city = CASE WHEN NULLIF(TRIM(tb.address_line), '') IS NULL AND NULLIF(TRIM(tb.city), '') IS NULL
                  AND c.address_line IS NOT DISTINCT FROM sb.address_line AND c.city IS NOT DISTINCT FROM sb.city
                  THEN tb.city ELSE c.city END,
      store_credit = COALESCE(c.store_credit, 0) - v_credit,
      legacy_spend = CASE WHEN c.legacy_spend IS NULL THEN NULL ELSE c.legacy_spend - v_legacy END
    WHERE c.id = p_customer_id
    RETURNING * INTO v_target;
  ELSE
    UPDATE public.customers SET psid = NULL WHERE id = p_customer_id RETURNING * INTO v_target;
  END IF;

  -- Give the chat its own record back
  IF v_has_merge AND v_merge.source_before IS NOT NULL THEN
    v_source_id := sb.id;
    v_source_name := sb.full_name;
    IF sb.mobile_number IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.customers x WHERE x.mobile_number = sb.mobile_number AND x.id <> sb.id) THEN
      sb.mobile_number := NULL;
    END IF;
    sb.psid := v_psid;
    IF EXISTS (SELECT 1 FROM public.customers WHERE id = sb.id) THEN
      UPDATE public.customers
      SET psid = v_psid, full_name = sb.full_name, address_line = sb.address_line,
          store_credit = sb.store_credit, mobile_number = sb.mobile_number
      WHERE id = sb.id;
    ELSE
      INSERT INTO public.customers VALUES (sb.*);
    END IF;

    UPDATE public.orders SET customer_id = sb.id
      WHERE customer_id = p_customer_id AND id IN (SELECT jsonb_array_elements_text(v_merge.moved->'orders')::uuid);
    UPDATE public.store_credit_entries SET customer_id = sb.id
      WHERE customer_id = p_customer_id AND id IN (SELECT jsonb_array_elements_text(v_merge.moved->'store_credit_entries')::uuid);
    UPDATE public.customer_carryovers SET customer_id = sb.id
      WHERE customer_id = p_customer_id AND id IN (SELECT jsonb_array_elements_text(v_merge.moved->'customer_carryovers')::uuid);
    UPDATE public.customer_email_logs SET customer_id = sb.id
      WHERE customer_id = p_customer_id AND id IN (SELECT jsonb_array_elements_text(v_merge.moved->'customer_email_logs')::uuid);
    UPDATE public.bus_shipments SET customer_id = sb.id
      WHERE customer_id = p_customer_id AND id IN (SELECT jsonb_array_elements_text(v_merge.moved->'bus_shipments')::uuid);
    UPDATE public.bus_ship_requests SET customer_id = sb.id
      WHERE customer_id = p_customer_id AND id IN (SELECT jsonb_array_elements_text(v_merge.moved->'bus_ship_requests')::uuid);

    IF ABS(v_credit) > 0.009 THEN
      INSERT INTO public.store_credit_entries (customer_id, amount, balance_after, reason, created_by_name)
      VALUES (p_customer_id, 0, v_target.store_credit, 'account_merge_undo', 'Undo merge: credit moved back'),
             (sb.id, 0, sb.store_credit, 'account_merge_undo', 'Undo merge: credit moved back');
    END IF;
  ELSE
    v_source_name := v_target.full_name;
    INSERT INTO public.customers (psid, full_name) VALUES (v_psid, v_target.full_name)
    RETURNING id INTO v_source_id;
  END IF;

  UPDATE public.customers c SET total_lifetime_spend = COALESCE((
    SELECT SUM(o.total_amount) FROM public.orders o
    WHERE o.customer_id = c.id AND COALESCE(o.status, '') NOT IN ('Cancelled', 'Returned')), 0)
  WHERE c.id IN (p_customer_id, v_source_id);

  UPDATE public.conversation_logs
  SET customer_psid = v_psid, customer_name = COALESCE(v_source_name, customer_name)
  WHERE id = ANY(v_log_ids);

  IF v_has_merge THEN
    UPDATE public.customer_merges SET undone_at = now(), undone_by = auth.uid() WHERE id = v_merge.id;
  END IF;

  RETURN jsonb_build_object('customer_id', p_customer_id, 'psid', v_psid, 'chat_customer_id', v_source_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Matching
-- ---------------------------------------------------------------------------

-- 'exact' | 'similar' | NULL for two names already passed through normalize_customer_name
CREATE OR REPLACE FUNCTION public.customer_name_match(a text, b text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  a_words text[] := STRING_TO_ARRAY(COALESCE(a, ''), ' ');
  b_words text[] := STRING_TO_ARRAY(COALESCE(b, ''), ' ');
  a_first text := COALESCE(a_words[1], '');
  a_last text := CASE WHEN CARDINALITY(a_words) >= 2 THEN a_words[CARDINALITY(a_words)] ELSE '' END;
  b_first text := COALESCE(b_words[1], '');
  b_last text := CASE WHEN CARDINALITY(b_words) >= 2 THEN b_words[CARDINALITY(b_words)] ELSE '' END;
BEGIN
  IF COALESCE(a, '') = '' OR COALESCE(b, '') = '' THEN RETURN NULL; END IF;
  IF a = b THEN RETURN 'exact'; END IF;
  IF a_last <> '' AND b_last <> '' AND a_first = b_first AND a_last = b_last THEN RETURN 'similar'; END IF;
  IF LENGTH(a_last) >= 4 AND LENGTH(a_first) >= 3 AND b LIKE '%' || a_last || '%' AND b LIKE a_first || '%' THEN RETURN 'similar'; END IF;
  RETURN NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.find_matching_customers_for_chat(text, text, text);

-- Customer accounts that may be this Messenger contact. Only accounts not yet
-- connected to any chat, and not marked "not the same person" for this chat.
CREATE OR REPLACE FUNCTION public.find_matching_customers_for_chat(
  p_psid text,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, psid text, full_name text, mobile_number text, address_line text,
  city text, province text, barangay text, suki_tier text, store_credit numeric,
  order_count bigint, total_spent numeric,
  match_type text, phone_match boolean, name_match text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_name text := public.normalize_customer_name(p_name);
  v_norm_phone text := public.normalize_ph_phone(p_phone);
BEGIN
  IF v_norm_name LIKE 'customer-%' OR v_norm_name = 'customer test' THEN
    v_norm_name := '';
  END IF;
  IF v_norm_name = '' AND v_norm_phone = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT c.id AS cid, c.psid AS cpsid, c.full_name AS cname, c.mobile_number AS cmobile,
      c.address_line AS caddr, c.city AS ccity, c.province AS cprov, c.barangay AS cbrgy,
      c.suki_tier AS ctier, c.store_credit AS ccredit,
      (v_norm_phone <> '' AND public.normalize_ph_phone(c.mobile_number) = v_norm_phone) AS is_phone,
      public.customer_name_match(v_norm_name, public.normalize_customer_name(c.full_name)) AS name_m
    FROM public.customers c
    WHERE c.psid IS NULL
      AND c.full_name IS NOT NULL AND TRIM(c.full_name) <> '' AND c.full_name NOT LIKE 'Customer-%'
      AND NOT EXISTS (SELECT 1 FROM public.chat_match_dismissals d WHERE d.psid = p_psid AND d.customer_id = c.id)
  )
  SELECT s.cid, s.cpsid, s.cname, s.cmobile, s.caddr, s.ccity, s.cprov, s.cbrgy, s.ctier, s.ccredit,
    COUNT(o.id),
    COALESCE(SUM(o.total_amount) FILTER (WHERE COALESCE(o.status, '') NOT IN ('Cancelled', 'Returned')), 0),
    CASE WHEN s.is_phone OR s.name_m = 'exact' THEN 'exact' ELSE 'similar' END,
    s.is_phone,
    s.name_m
  FROM scored s
  LEFT JOIN public.orders o ON o.customer_id = s.cid
  WHERE s.is_phone OR s.name_m IS NOT NULL
  GROUP BY s.cid, s.cpsid, s.cname, s.cmobile, s.caddr, s.ccity, s.cprov, s.cbrgy, s.ctier, s.ccredit, s.is_phone, s.name_m
  ORDER BY (s.is_phone AND s.name_m IS NOT NULL) DESC,
    CASE WHEN s.is_phone OR s.name_m = 'exact' THEN 0 ELSE 1 END,
    COUNT(o.id) DESC
  LIMIT 5;
END;
$$;

DROP FUNCTION IF EXISTS public.find_matching_chats_for_customer(uuid, text, text);

-- Messenger contacts that may be this customer account. chat_order_count /
-- chat_store_credit > 0 means linking would merge two accounts.
CREATE OR REPLACE FUNCTION public.find_matching_chats_for_customer(
  p_customer_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS TABLE (
  psid text, chat_customer_id uuid, chat_customer_name text, mobile_number text,
  location_city text, last_message text, last_message_at timestamptz,
  match_type text, phone_match boolean, name_match text,
  chat_order_count bigint, chat_store_credit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_name text := public.normalize_customer_name(p_name);
  v_norm_phone text := public.normalize_ph_phone(p_phone);
BEGIN
  IF v_norm_name = '' AND v_norm_phone = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT c.id AS cid, c.psid AS cpsid, c.full_name AS cname, c.mobile_number AS cmobile,
      COALESCE(c.location_city, c.city) AS cloc,
      COALESCE(c.store_credit, 0) AS ccredit,
      (v_norm_phone <> '' AND public.normalize_ph_phone(c.mobile_number) = v_norm_phone) AS is_phone,
      public.customer_name_match(v_norm_name, public.normalize_customer_name(c.full_name)) AS name_m
    FROM public.customers c
    WHERE c.psid IS NOT NULL AND TRIM(c.psid) <> ''
      AND (p_customer_id IS NULL OR c.id <> p_customer_id)
      AND c.full_name IS NOT NULL AND TRIM(c.full_name) <> '' AND c.full_name NOT LIKE 'Customer-%'
      AND NOT EXISTS (SELECT 1 FROM public.chat_match_dismissals d WHERE d.psid = c.psid AND d.customer_id = p_customer_id)
  )
  SELECT s.cpsid, s.cid, s.cname, s.cmobile, s.cloc,
    latest_log.message_text, latest_log.created_at,
    CASE WHEN s.is_phone OR s.name_m = 'exact' THEN 'exact' ELSE 'similar' END,
    s.is_phone, s.name_m,
    (SELECT COUNT(*) FROM public.orders o WHERE o.customer_id = s.cid),
    s.ccredit
  FROM scored s
  LEFT JOIN LATERAL (
    SELECT cl.message_text, cl.created_at FROM public.conversation_logs cl
    WHERE cl.customer_psid = s.cpsid ORDER BY cl.created_at DESC LIMIT 1
  ) latest_log ON true
  WHERE s.is_phone OR s.name_m IS NOT NULL
  ORDER BY (s.is_phone AND s.name_m IS NOT NULL) DESC,
    CASE WHEN s.is_phone OR s.name_m = 'exact' THEN 0 ELSE 1 END,
    latest_log.created_at DESC NULLS LAST
  LIMIT 5;
END;
$$;

REVOKE ALL ON FUNCTION public.link_chat_psid_to_customer(text, uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_chat_psid_from_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_matching_customers_for_chat(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_matching_chats_for_customer(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_name_match(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_chat_psid_to_customer(text, uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlink_chat_psid_from_customer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_matching_customers_for_chat(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_matching_chats_for_customer(uuid, text, text) TO authenticated, service_role;
