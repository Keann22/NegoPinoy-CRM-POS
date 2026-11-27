-- Messenger AI Sales Copilot: atomic DB cooldown for auto-scanning incoming chats
-- Prevents concurrent dashboard polls from duplicate-scanning Messenger bursts.

ALTER TABLE public.messenger_ai_action_rules
  ADD COLUMN IF NOT EXISTS last_auto_scan_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_messenger_ai_autoscan(
  min_interval_seconds INT DEFAULT 90
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_popup_enabled BOOLEAN;
  v_last_scan TIMESTAMPTZ;
  v_interval INT := GREATEST(30, COALESCE(min_interval_seconds, 90));
BEGIN
  -- Serialize concurrent polls across serverless instances.
  PERFORM pg_advisory_xact_lock(728194620);

  SELECT EXISTS (
    SELECT 1
    FROM public.messenger_ai_action_rules
    WHERE enabled = TRUE AND show_sales_popup = TRUE
  ) INTO v_popup_enabled;

  IF NOT COALESCE(v_popup_enabled, FALSE) THEN
    RETURN FALSE;
  END IF;

  SELECT MAX(last_auto_scan_at)
  FROM public.messenger_ai_action_rules
  INTO v_last_scan;

  IF v_last_scan IS NOT NULL AND v_last_scan > NOW() - make_interval(secs => v_interval) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.messenger_ai_action_rules
  SET last_auto_scan_at = NOW();

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_messenger_ai_autoscan(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_messenger_ai_autoscan(INT) TO service_role;
