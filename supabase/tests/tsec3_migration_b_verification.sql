-- T-SEC3 Phase B verification — run in the Supabase SQL editor AFTER applying
-- migration 113 (and after 112 + the Phase 2 code are live).
--
-- Confirms the 5 sensitive columns are no longer readable by anon/authenticated,
-- that safe columns and the 067 push revoke are untouched, and that the
-- self-scoped RPCs still work. Returns a PASS/FAIL grid (editor hides RAISE
-- NOTICE). Read-only apart from a transaction-local JWT claim that never
-- persists.

CREATE OR REPLACE FUNCTION pg_temp._tsec3b_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_bad text;
  v_uid uuid;
  v_json jsonb;
BEGIN
  -- 1. NONE of the 5 revoked columns are selectable by anon or authenticated
  check_name := '1. the 5 columns NOT selectable by anon/authenticated';
  SELECT string_agg(role || '.' || col, ', ') INTO v_bad
  FROM (
    SELECT r AS role, c AS col
    FROM unnest(ARRAY['anon','authenticated']) AS r
    CROSS JOIN unnest(ARRAY['is_admin','payout_method','stripe_account_id',
                            'wompi_merchant_id','total_earnings_cents']) AS c
    WHERE has_column_privilege(r, 'public.users', c, 'SELECT')
  ) x;
  result := CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL (still readable: ' || v_bad || ')' END;
  RETURN NEXT;

  -- 2. Safe columns are still readable by authenticated (no over-revoke)
  check_name := '2. safe cols (name, avatar_url, location_lat, email) still readable';
  result := CASE WHEN has_column_privilege('authenticated','public.users','name','SELECT')
                  AND has_column_privilege('authenticated','public.users','avatar_url','SELECT')
                  AND has_column_privilege('authenticated','public.users','location_lat','SELECT')
                  AND has_column_privilege('authenticated','public.users','email','SELECT')
                 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- 3. 067 still intact: push_subscription remains non-readable
  check_name := '3. 067 intact: push_subscription NOT readable';
  result := CASE WHEN NOT has_column_privilege('authenticated','public.users','push_subscription','SELECT')
                  AND NOT has_column_privilege('anon','public.users','push_subscription','SELECT')
                 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- 4. Self billing RPC still returns own payout fields (definer unaffected)
  check_name := '4. get_my_private_profile() still returns own payout fields';
  SELECT id INTO v_uid FROM public.users ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL THEN
    result := 'FAIL (no users to test with)';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text)::text, true);
    v_json := public.get_my_private_profile();
    result := CASE WHEN v_json ? 'payout_method' THEN 'PASS' ELSE 'FAIL (' || COALESCE(v_json::text,'null') || ')' END;
    PERFORM set_config('request.jwt.claims', NULL, true);
  END IF;
  RETURN NEXT;

  -- 5. get_admin_user_ids() still returns the admin set
  check_name := '5. get_admin_user_ids() still returns admins';
  result := CASE WHEN (SELECT count(*) FROM public.get_admin_user_ids())
                    = (SELECT count(*) FROM public.users WHERE is_admin = true)
                 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._tsec3b_verify();
