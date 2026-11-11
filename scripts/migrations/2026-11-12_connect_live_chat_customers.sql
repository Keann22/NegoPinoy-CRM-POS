-- 2026-11-12: Connect Live Chat (Messenger PSIDs & conversation_logs) to POS Customer Accounts
-- Provides helper RPCs to:
-- 1. Safely merge/link a Messenger PSID into an existing POS customer account without losing conversation_logs or orders
-- 2. Find matching POS customer accounts for a Live Chat thread (exact & similar matches)
-- 3. Find matching Live Chat threads for a POS customer account (for Customer Profile & Order Form confirmation)

CREATE OR REPLACE FUNCTION public.normalize_customer_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LOWER(
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(COALESCE(p_name, ''), '\s+[A-Za-z]\.?\s+', ' ', 'g'),
        '\s+', ' ', 'g'
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_ph_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g')) >= 10
    THEN RIGHT(REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), 10)
    ELSE ''
  END;
$$;

CREATE OR REPLACE FUNCTION public.link_chat_psid_to_customer(
  p_psid text,
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_cust public.customers%ROWTYPE;
  v_target_cust public.customers%ROWTYPE;
  v_log_ids uuid[];
  v_old_psid_log_ids uuid[];
  v_calc_spend numeric := 0;
  v_merged_mobile text;
BEGIN
  IF p_psid IS NULL OR TRIM(p_psid) = '' OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Both p_psid and p_customer_id are required';
  END IF;

  SELECT * INTO v_target_cust
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target customer % not found', p_customer_id;
  END IF;

  SELECT * INTO v_chat_cust
  FROM public.customers
  WHERE psid = p_psid
  FOR UPDATE;

  SELECT ARRAY_AGG(id) INTO v_log_ids
  FROM public.conversation_logs
  WHERE customer_psid = p_psid;

  IF v_target_cust.psid IS NOT NULL AND v_target_cust.psid <> p_psid THEN
    SELECT ARRAY_AGG(id) INTO v_old_psid_log_ids
    FROM public.conversation_logs
    WHERE customer_psid = v_target_cust.psid;
  END IF;

  IF v_chat_cust.id IS NOT NULL AND v_chat_cust.id <> p_customer_id THEN
    IF v_log_ids IS NOT NULL AND ARRAY_LENGTH(v_log_ids, 1) > 0 THEN
      UPDATE public.conversation_logs
      SET customer_psid = NULL
      WHERE id = ANY(v_log_ids);
    END IF;

    IF v_old_psid_log_ids IS NOT NULL AND ARRAY_LENGTH(v_old_psid_log_ids, 1) > 0 THEN
      UPDATE public.conversation_logs
      SET customer_psid = NULL
      WHERE id = ANY(v_old_psid_log_ids);
    END IF;

    UPDATE public.orders SET customer_id = p_customer_id WHERE customer_id = v_chat_cust.id;
    UPDATE public.store_credit_entries SET customer_id = p_customer_id WHERE customer_id = v_chat_cust.id;
    UPDATE public.customer_carryovers SET customer_id = p_customer_id WHERE customer_id = v_chat_cust.id;
    UPDATE public.customer_email_logs SET customer_id = p_customer_id WHERE customer_id = v_chat_cust.id;
    UPDATE public.bus_shipments SET customer_id = p_customer_id WHERE customer_id = v_chat_cust.id;
    UPDATE public.bus_ship_requests SET customer_id = p_customer_id WHERE customer_id = v_chat_cust.id;

    UPDATE public.customers
    SET psid = NULL,
        mobile_number = NULL,
        full_name = NULL,
        address_line = NULL
    WHERE id = v_chat_cust.id;
  ELSIF v_old_psid_log_ids IS NOT NULL AND ARRAY_LENGTH(v_old_psid_log_ids, 1) > 0 THEN
    UPDATE public.conversation_logs
    SET customer_psid = NULL
    WHERE id = ANY(v_old_psid_log_ids);
  END IF;

  v_merged_mobile := COALESCE(NULLIF(TRIM(v_target_cust.mobile_number), ''), NULLIF(TRIM(v_chat_cust.mobile_number), ''));
  IF v_merged_mobile IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.customers
      WHERE mobile_number = v_merged_mobile AND id <> p_customer_id
    ) THEN
      v_merged_mobile := v_target_cust.mobile_number;
    END IF;
  END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_calc_spend
  FROM public.orders
  WHERE customer_id = p_customer_id
    AND COALESCE(status, '') NOT IN ('Cancelled', 'Returned');

  UPDATE public.customers
  SET
    psid = p_psid,
    full_name = COALESCE(NULLIF(TRIM(v_target_cust.full_name), ''), NULLIF(TRIM(v_chat_cust.full_name), '')),
    mobile_number = v_merged_mobile,
    stove_type = COALESCE(v_target_cust.stove_type, v_chat_cust.stove_type),
    family_size = COALESCE(v_target_cust.family_size, v_chat_cust.family_size),
    specialty_cuisine = COALESCE(v_target_cust.specialty_cuisine, v_chat_cust.specialty_cuisine),
    preferred_payment = COALESCE(v_target_cust.preferred_payment, v_chat_cust.preferred_payment),
    preferred_honorific = COALESCE(v_target_cust.preferred_honorific, v_chat_cust.preferred_honorific),
    location_city = COALESCE(v_target_cust.location_city, v_target_cust.city, v_chat_cust.location_city),
    location_barangay = COALESCE(v_target_cust.location_barangay, v_target_cust.barangay, v_chat_cust.location_barangay),
    ai_summary_notes = CASE
      WHEN v_target_cust.ai_summary_notes IS NOT NULL AND v_chat_cust.ai_summary_notes IS NOT NULL AND v_target_cust.ai_summary_notes <> v_chat_cust.ai_summary_notes
      THEN v_target_cust.ai_summary_notes || E'\n' || v_chat_cust.ai_summary_notes
      ELSE COALESCE(v_target_cust.ai_summary_notes, v_chat_cust.ai_summary_notes)
    END,
    pain_points = COALESCE(v_target_cust.pain_points, v_chat_cust.pain_points),
    total_lifetime_spend = GREATEST(COALESCE(v_target_cust.total_lifetime_spend, 0), COALESCE(v_chat_cust.total_lifetime_spend, 0), v_calc_spend),
    store_credit = COALESCE(v_target_cust.store_credit, 0) + COALESCE(CASE WHEN v_chat_cust.id <> p_customer_id THEN v_chat_cust.store_credit ELSE 0 END, 0)
  WHERE id = p_customer_id
  RETURNING * INTO v_target_cust;

  IF v_log_ids IS NOT NULL AND ARRAY_LENGTH(v_log_ids, 1) > 0 THEN
    UPDATE public.conversation_logs
    SET customer_psid = p_psid,
        customer_name = COALESCE(v_target_cust.full_name, customer_name)
    WHERE id = ANY(v_log_ids);
  END IF;

  IF v_old_psid_log_ids IS NOT NULL AND ARRAY_LENGTH(v_old_psid_log_ids, 1) > 0 THEN
    UPDATE public.conversation_logs
    SET customer_psid = p_psid,
        customer_name = COALESCE(v_target_cust.full_name, customer_name)
    WHERE id = ANY(v_old_psid_log_ids);
  END IF;

  UPDATE public.conversation_logs
  SET customer_name = v_target_cust.full_name
  WHERE customer_psid = p_psid
    AND v_target_cust.full_name IS NOT NULL;

  RETURN to_jsonb(v_target_cust);
END;
$$;

CREATE OR REPLACE FUNCTION public.find_matching_customers_for_chat(
  p_psid text,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  psid text,
  full_name text,
  mobile_number text,
  address_line text,
  city text,
  province text,
  barangay text,
  suki_tier text,
  store_credit numeric,
  order_count bigint,
  total_spent numeric,
  match_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_name text := public.normalize_customer_name(p_name);
  v_norm_phone text := public.normalize_ph_phone(p_phone);
  v_first_word text := SPLIT_PART(v_norm_name, ' ', 1);
  v_last_word text := CASE
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(v_norm_name, ' '), 1) >= 2
    THEN SPLIT_PART(v_norm_name, ' ', ARRAY_LENGTH(STRING_TO_ARRAY(v_norm_name, ' '), 1))
    ELSE ''
  END;
BEGIN
  IF (v_norm_name = '' OR v_norm_name LIKE 'customer-%' OR v_norm_name = 'customer test') AND v_norm_phone = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      c.id,
      c.psid,
      c.full_name,
      c.mobile_number,
      c.address_line,
      c.city,
      c.province,
      c.barangay,
      c.suki_tier,
      c.store_credit,
      CASE
        WHEN v_norm_phone <> '' AND public.normalize_ph_phone(c.mobile_number) = v_norm_phone THEN 'exact'
        WHEN v_norm_name <> '' AND public.normalize_customer_name(c.full_name) = v_norm_name THEN 'exact'
        WHEN v_first_word <> '' AND v_last_word <> ''
          AND SPLIT_PART(public.normalize_customer_name(c.full_name), ' ', 1) = v_first_word
          AND SPLIT_PART(public.normalize_customer_name(c.full_name), ' ', ARRAY_LENGTH(STRING_TO_ARRAY(public.normalize_customer_name(c.full_name), ' '), 1)) = v_last_word
        THEN 'similar'
        WHEN LENGTH(v_last_word) >= 4 AND public.normalize_customer_name(c.full_name) LIKE '%' || v_last_word || '%'
          AND LENGTH(v_first_word) >= 3 AND public.normalize_customer_name(c.full_name) LIKE v_first_word || '%'
        THEN 'similar'
        ELSE NULL
      END AS matched_as
    FROM public.customers c
    WHERE (c.psid IS NULL OR c.psid <> COALESCE(p_psid, ''))
      AND c.full_name IS NOT NULL
      AND TRIM(c.full_name) <> ''
      AND c.full_name NOT LIKE 'Customer-%'
      AND (
        c.address_line IS NOT NULL
        OR c.city IS NOT NULL
        OR c.mobile_number IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.orders o WHERE o.customer_id = c.id)
      )
  )
  SELECT
    cand.id,
    cand.psid,
    cand.full_name,
    cand.mobile_number,
    cand.address_line,
    cand.city,
    cand.province,
    cand.barangay,
    cand.suki_tier,
    cand.store_credit,
    COUNT(o.id) AS order_count,
    COALESCE(SUM(o.total_amount) FILTER (WHERE COALESCE(o.status, '') NOT IN ('Cancelled', 'Returned')), 0) AS total_spent,
    cand.matched_as AS match_type
  FROM candidates cand
  LEFT JOIN public.orders o ON o.customer_id = cand.id
  WHERE cand.matched_as IS NOT NULL
  GROUP BY
    cand.id, cand.psid, cand.full_name, cand.mobile_number,
    cand.address_line, cand.city, cand.province, cand.barangay,
    cand.suki_tier, cand.store_credit, cand.matched_as
  ORDER BY
    CASE WHEN cand.matched_as = 'exact' THEN 0 ELSE 1 END,
    COUNT(o.id) DESC
  LIMIT 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_matching_chats_for_customer(
  p_customer_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS TABLE (
  psid text,
  chat_customer_id uuid,
  chat_customer_name text,
  mobile_number text,
  location_city text,
  last_message text,
  last_message_at timestamptz,
  match_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_name text := public.normalize_customer_name(p_name);
  v_norm_phone text := public.normalize_ph_phone(p_phone);
  v_first_word text := SPLIT_PART(v_norm_name, ' ', 1);
  v_last_word text := CASE
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(v_norm_name, ' '), 1) >= 2
    THEN SPLIT_PART(v_norm_name, ' ', ARRAY_LENGTH(STRING_TO_ARRAY(v_norm_name, ' '), 1))
    ELSE ''
  END;
BEGIN
  IF v_norm_name = '' AND v_norm_phone = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matched_chat_customers AS (
    SELECT
      c.id AS chat_customer_id,
      c.psid,
      c.full_name AS chat_customer_name,
      c.mobile_number,
      COALESCE(c.location_city, c.city) AS location_city,
      CASE
        WHEN v_norm_phone <> '' AND public.normalize_ph_phone(c.mobile_number) = v_norm_phone THEN 'exact'
        WHEN v_norm_name <> '' AND public.normalize_customer_name(c.full_name) = v_norm_name THEN 'exact'
        WHEN v_first_word <> '' AND v_last_word <> ''
          AND SPLIT_PART(public.normalize_customer_name(c.full_name), ' ', 1) = v_first_word
          AND SPLIT_PART(public.normalize_customer_name(c.full_name), ' ', ARRAY_LENGTH(STRING_TO_ARRAY(public.normalize_customer_name(c.full_name), ' '), 1)) = v_last_word
        THEN 'similar'
        WHEN LENGTH(v_last_word) >= 4 AND public.normalize_customer_name(c.full_name) LIKE '%' || v_last_word || '%'
          AND LENGTH(v_first_word) >= 3 AND public.normalize_customer_name(c.full_name) LIKE v_first_word || '%'
        THEN 'similar'
        ELSE NULL
      END AS matched_as
    FROM public.customers c
    WHERE c.psid IS NOT NULL
      AND TRIM(c.psid) <> ''
      AND (p_customer_id IS NULL OR c.id <> p_customer_id)
      AND c.full_name IS NOT NULL
      AND TRIM(c.full_name) <> ''
      AND c.full_name NOT LIKE 'Customer-%'
  )
  SELECT
    m.psid,
    m.chat_customer_id,
    m.chat_customer_name,
    m.mobile_number,
    m.location_city,
    latest_log.message_text AS last_message,
    latest_log.created_at AS last_message_at,
    m.matched_as AS match_type
  FROM matched_chat_customers m
  LEFT JOIN LATERAL (
    SELECT cl.message_text, cl.created_at
    FROM public.conversation_logs cl
    WHERE cl.customer_psid = m.psid
    ORDER BY cl.created_at DESC
    LIMIT 1
  ) latest_log ON true
  WHERE m.matched_as IS NOT NULL
  ORDER BY
    CASE WHEN m.matched_as = 'exact' THEN 0 ELSE 1 END,
    latest_log.created_at DESC NULLS LAST
  LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_customer_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_ph_phone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_chat_psid_to_customer(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_matching_customers_for_chat(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_matching_chats_for_customer(uuid, text, text) TO authenticated, service_role;
