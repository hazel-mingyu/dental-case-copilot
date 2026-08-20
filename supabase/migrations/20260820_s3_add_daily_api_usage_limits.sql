BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.api_daily_usage_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('voice_transcribe', 'voice_extract_candidates', 'case_summary', 'case_ppt')),
  usage_date date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation, usage_date)
);

ALTER TABLE private.api_daily_usage_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON TABLE private.api_daily_usage_limits FROM PUBLIC;
REVOKE ALL ON TABLE private.api_daily_usage_limits FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_daily_api_quota(p_operation text)
RETURNS TABLE (allowed boolean, used integer, quota_limit integer, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_usage_date date := (now() AT TIME ZONE 'UTC')::date;
  v_limit integer;
  v_allowed boolean;
  v_used integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_limit := CASE p_operation
    WHEN 'voice_transcribe' THEN 50
    WHEN 'voice_extract_candidates' THEN 100
    WHEN 'case_summary' THEN 30
    WHEN 'case_ppt' THEN 50
    ELSE NULL
  END;

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'invalid quota operation';
  END IF;

  WITH incremented AS (
    INSERT INTO private.api_daily_usage_limits (user_id, operation, usage_date, used)
    VALUES (v_user_id, p_operation, v_usage_date, 1)
    ON CONFLICT (user_id, operation, usage_date) DO UPDATE
      SET used = private.api_daily_usage_limits.used + 1,
          updated_at = now()
      WHERE private.api_daily_usage_limits.used < v_limit
    RETURNING private.api_daily_usage_limits.used
  )
  SELECT
    EXISTS (SELECT 1 FROM incremented),
    COALESCE(
      (SELECT i.used FROM incremented AS i),
      (SELECT existing.used
        FROM private.api_daily_usage_limits AS existing
        WHERE existing.user_id = v_user_id
          AND existing.operation = p_operation
          AND existing.usage_date = v_usage_date)
    )
  INTO v_allowed, v_used;

  RETURN QUERY
  SELECT v_allowed, v_used, v_limit, GREATEST(v_limit - v_used, 0);
END;
$$;

COMMENT ON FUNCTION public.consume_daily_api_quota(text) IS
  'Counts requests admitted to high-cost processing. A later model or PPT failure still consumes the quota; no refund is performed.';

REVOKE ALL ON FUNCTION public.consume_daily_api_quota(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_daily_api_quota(text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.consume_daily_api_quota(text) TO authenticated;

COMMIT;
