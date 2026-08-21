-- ============================================================================
-- 143_d9_invite_expiry_REHEARSAL.sql  —  NOT A MIGRATION. DO NOT let this file
-- be auto-applied by any migration runner. Lives outside supabase/migrations/.
--
-- Purpose: paste this whole file into the Supabase SQL Editor and Run once. It
-- opens a transaction, applies migration 143's body verbatim, then returns a
-- SINGLE final result set — one row per check — and ROLLS BACK, leaving ZERO
-- changes. The SQL Editor shows only the last statement's result and has no
-- Notices panel, so every check is folded into that one closing SELECT.
--
-- Read the ALL_CHECKS row: pass = true means every check passed.
--
-- Fixtures are POINT-IN-TIME (captured 2026-08-19, America/Bogota):
--   (a) 8ee7e66d-0170-4e58-8d21-a0658cd1f750 — future occurrence 2026-08-20 17:30
--       (a recurring CHILD whose own start is still in the future). VALID ONLY
--       WHILE that start is in the future; after 2026-08-20 20:30-05 it becomes
--       a past child and returns case (c) instead — run before then.
--   (b) 7e022291-b53f-4f47-9bef-3118cf2f5ed5 — active OPEN-ENDED monthly parent
--       (own date 2026-07-05), next occurrence (~2026-09-05) beyond the cron
--       lookahead, so no materialized future child → the 7-day floor.
--   (c) 3622363f-34bb-493a-96e3-0a0e09175079 — past non-recurring session
--       (2026-08-14) → must RAISE.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- MIGRATION 143 BODY (verbatim) — helper, grants, create_session_invite
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.session_invite_expiry(p_session_id uuid)
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anchor             timestamptz;
  v_is_recurring       boolean;
  v_recurring_parent_id uuid;
BEGIN
  SELECT min((s.date + s.start_time) AT TIME ZONE 'America/Bogota')
    INTO v_anchor
    FROM public.sessions s
   WHERE (s.id = p_session_id OR s.recurring_parent_id = p_session_id)
     AND s.date IS NOT NULL
     AND s.start_time IS NOT NULL
     AND ((s.date + s.start_time) AT TIME ZONE 'America/Bogota') >= now();

  IF v_anchor IS NOT NULL THEN
    RETURN v_anchor + interval '3 hours';
  END IF;

  SELECT s.is_recurring, s.recurring_parent_id
    INTO v_is_recurring, v_recurring_parent_id
    FROM public.sessions s
   WHERE s.id = p_session_id;

  IF v_is_recurring IS TRUE AND v_recurring_parent_id IS NULL THEN
    RETURN now() + interval '7 days';
  END IF;

  RAISE EXCEPTION 'cannot create an invite for a session that has already started'
    USING ERRCODE = 'check_violation';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.session_invite_expiry(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.session_invite_expiry(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.session_invite_expiry(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.session_invite_expiry(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_session_invite(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token      text;
  v_expires_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized to create an invite for this session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sessions s
     WHERE s.id = p_session_id AND s.creator_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.session_participants sp
     WHERE sp.session_id = p_session_id
       AND sp.user_id = auth.uid()
       AND sp.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'not authorized to create an invite for this session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_expires_at := public.session_invite_expiry(p_session_id);

  v_token := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.invite_tokens (session_id, token, created_by, expires_at)
  VALUES (p_session_id, v_token, auth.uid(), v_expires_at);
  RETURN v_token;
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────────
-- CASE (c) helper — a TEMP function so the expected RAISE is caught and turned
-- into a value the final SELECT can assert on. Temp objects live only for this
-- session and vanish on ROLLBACK; they never touch the committed schema.
-- ──────────────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.rehearsal_case_c()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE v_ts timestamptz;
BEGIN
  v_ts := public.session_invite_expiry('3622363f-34bb-493a-96e3-0a0e09175079');
  RETURN 'NO RAISE: ' || v_ts::text;
EXCEPTION WHEN others THEN
  RETURN 'RAISED: ' || SQLERRM;
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────────
-- SINGLE FINAL RESULT SET — one row per check, plus an ALL_CHECKS summary row.
-- Columns: check_name text | actual text | expected text | pass boolean.
-- ──────────────────────────────────────────────────────────────────────────
WITH checks(ord, check_name, actual, expected, pass) AS (
  -- (a) future occurrence → next start + 3h
  SELECT 1, 'a_future_occurrence'::text,
    public.session_invite_expiry('8ee7e66d-0170-4e58-8d21-a0658cd1f750')::text,
    ((timestamp '2026-08-20 17:30' AT TIME ZONE 'America/Bogota') + interval '3 hours')::text,
    ( public.session_invite_expiry('8ee7e66d-0170-4e58-8d21-a0658cd1f750')
        = (timestamp '2026-08-20 17:30' AT TIME ZONE 'America/Bogota') + interval '3 hours' )

  UNION ALL
  -- (b) true open-ended parent, next occurrence beyond lookahead → ~ now()+7d
  SELECT 2, 'b_recurring_parent_floor'::text,
    public.session_invite_expiry('7e022291-b53f-4f47-9bef-3118cf2f5ed5')::text,
    (now() + interval '7 days')::text,
    ( abs(extract(epoch FROM (
        public.session_invite_expiry('7e022291-b53f-4f47-9bef-3118cf2f5ed5')
        - (now() + interval '7 days') ))) < 5 )

  UNION ALL
  -- (c) past non-recurring session → must RAISE (caught by the temp function)
  SELECT 3, 'c_past_session_raises'::text,
    pg_temp.rehearsal_case_c(),
    'RAISED: %already started%'::text,
    ( pg_temp.rehearsal_case_c() LIKE 'RAISED:%already started%' )

  UNION ALL
  -- grants: anon must NOT have EXECUTE
  SELECT 4, 'grants_anon'::text,
    has_function_privilege('anon', 'public.session_invite_expiry(uuid)', 'EXECUTE')::text,
    'false'::text,
    ( has_function_privilege('anon', 'public.session_invite_expiry(uuid)', 'EXECUTE') = false )

  UNION ALL
  -- grants: authenticated must NOT have EXECUTE
  SELECT 5, 'grants_authenticated'::text,
    has_function_privilege('authenticated', 'public.session_invite_expiry(uuid)', 'EXECUTE')::text,
    'false'::text,
    ( has_function_privilege('authenticated', 'public.session_invite_expiry(uuid)', 'EXECUTE') = false )

  UNION ALL
  -- grants: service_role MUST have EXECUTE
  SELECT 6, 'grants_service_role'::text,
    has_function_privilege('service_role', 'public.session_invite_expiry(uuid)', 'EXECUTE')::text,
    'true'::text,
    ( has_function_privilege('service_role', 'public.session_invite_expiry(uuid)', 'EXECUTE') = true )
)
SELECT check_name, actual, expected, pass
FROM (
  SELECT ord, check_name, actual, expected, pass FROM checks
  UNION ALL
  SELECT 7,
         'ALL_CHECKS'::text,
         (count(*) FILTER (WHERE pass))::text || ' of ' || count(*)::text || ' passed',
         'all true'::text,
         bool_and(pass)
    FROM checks
) q
ORDER BY q.ord;

ROLLBACK;
