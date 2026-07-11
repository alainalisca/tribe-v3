-- T-SEC1 Gate 2.5b verification — run in the Supabase SQL editor AFTER applying
-- migration 120. Expect 10 rows, all PASS.
--
-- Wrapped in BEGIN ... ROLLBACK. It creates throwaway sessions, an invite token,
-- and waitlist offers, and impersonates test users via a transaction-local JWT
-- claim. ALL writes are rolled back; production data is untouched.
--
-- Coverage (your required cases):
--   1  guest token-less on OPEN            -> confirmed (allowed)
--   2  guest token-less on CURATED         -> invite_required (fail closed)
--   3  guest token-less on INVITE_ONLY     -> invite_required (fail closed)
--   4  guest WITH valid token on INVITE    -> confirmed
--   5  guest_token IS returned (non-null)
--   6  waitlist accept, valid offer, AT capacity -> confirmed
--   7  waitlist accept, EXPIRED offer      -> rejected (offer_expired)
--   8  waitlist accept, NO offer           -> rejected (no_offer)
--   9  waitlist accept for ANOTHER user    -> forbidden
--   10 anon cannot EXECUTE accept_waitlist_offer; authenticated can

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._tsec1_2_5b_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_a uuid; v_b uuid;
  v_open uuid; v_curated uuid; v_invite uuid; v_wl uuid;
  v_res jsonb;
  v_tok text := 'tsec1b-probe-token';
BEGIN
  -- fixtures: two real users
  SELECT id INTO v_a FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM public.users WHERE id <> v_a ORDER BY created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN
    check_name := 'fixture'; result := 'FAIL (need 2 users)'; RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 10, 'open probe', 'active', 'open', false, 0)
  RETURNING id INTO v_open;
  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 10, 'curated probe', 'active', 'curated', false, 0)
  RETURNING id INTO v_curated;
  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 10, 'invite probe', 'active', 'invite_only', false, 0)
  RETURNING id INTO v_invite;
  -- waitlist probe: capacity 1, already full (creator holds the one seat)
  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 1, 'waitlist probe', 'active', 'open', false, 0)
  RETURNING id INTO v_wl;
  INSERT INTO public.session_participants (session_id, user_id, status) VALUES (v_wl, v_b, 'confirmed');

  INSERT INTO public.invite_tokens (token, session_id, created_by, expires_at)
    VALUES (v_tok, v_invite, v_b, now() + interval '1 day');

  -- ============ GUEST DOOR (runs as anon: no JWT claim) ============
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- 1 & 5. token-less guest on OPEN -> confirmed, and guest_token returned
  v_res := public.join_session_as_guest(v_open, NULL, 'Guest Open', '300');
  check_name := '1. guest token-less on OPEN -> confirmed';
  result := CASE WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  check_name := '5. guest_token IS returned (non-null)';
  result := CASE WHEN (v_res->'guest_token') IS NOT NULL AND v_res->>'guest_token' <> ''
                 THEN 'PASS' ELSE 'FAIL (' || COALESCE(v_res::text,'null') || ')' END;
  RETURN NEXT;

  -- 2. token-less guest on CURATED -> invite_required (fail closed)
  check_name := '2. guest token-less on CURATED -> invite_required';
  v_res := public.join_session_as_guest(v_curated, NULL, 'Guest Cur', '301');
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'invite_required'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 3. token-less guest on INVITE_ONLY -> invite_required (fail closed)
  check_name := '3. guest token-less on INVITE_ONLY -> invite_required';
  v_res := public.join_session_as_guest(v_invite, NULL, 'Guest Inv', '302');
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'invite_required'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 4. guest WITH a valid token on INVITE_ONLY -> confirmed
  check_name := '4. guest valid token on INVITE_ONLY -> confirmed';
  v_res := public.join_session_as_guest(v_invite, v_tok, 'Guest Tok', '303');
  result := CASE WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- ============ WAITLIST DOOR ============

  -- 6. valid offer, session AT capacity -> confirmed anyway (reserved seat)
  INSERT INTO public.session_waitlist (session_id, user_id, position, status, offered_at, offer_expires_at)
    VALUES (v_wl, v_a, 1, 'offered', now(), now() + interval '1 day');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text)::text, true);
  check_name := '6. waitlist accept, valid offer, AT capacity -> confirmed';
  v_res := public.accept_waitlist_offer(v_wl, v_a);
  result := CASE
    WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
     AND EXISTS (SELECT 1 FROM session_participants WHERE session_id = v_wl AND user_id = v_a AND status = 'confirmed')
     AND (SELECT status FROM session_waitlist WHERE session_id = v_wl AND user_id = v_a) = 'accepted'
    THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 7. EXPIRED offer -> offer_expired. Reset A's offer to expired (undo accept).
  UPDATE public.session_waitlist SET status = 'offered', offer_expires_at = now() - interval '1 hour'
    WHERE session_id = v_wl AND user_id = v_a;
  DELETE FROM public.session_participants WHERE session_id = v_wl AND user_id = v_a;
  check_name := '7. waitlist accept, EXPIRED offer -> offer_expired';
  v_res := public.accept_waitlist_offer(v_wl, v_a);
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'offer_expired'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 8. NO offer -> no_offer (A has no offer on the open probe session)
  check_name := '8. waitlist accept, NO offer -> no_offer';
  v_res := public.accept_waitlist_offer(v_open, v_a);
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'no_offer'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 9. accepting on behalf of ANOTHER user -> forbidden (A calls with p_user_id=B)
  check_name := '9. waitlist accept for another user -> forbidden';
  v_res := public.accept_waitlist_offer(v_wl, v_b);
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'forbidden'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 10. grants: anon DENY, authenticated EXEC
  check_name := '10. accept_waitlist_offer: anon=DENY, authenticated=EXEC';
  result := CASE
    WHEN has_function_privilege('authenticated', 'public.accept_waitlist_offer(uuid,uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.accept_waitlist_offer(uuid,uuid)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._tsec1_2_5b_verify();

ROLLBACK;
