-- Migration 143 — D9: session-anchored invite-token expiry (T-C1/C12)
--
-- PROBLEM. invite_tokens.expires_at is anchored to MINT time, not session
-- time: create_session_invite inserts (session_id, token, created_by) and lets
-- the column default (now() + '7 days', migration 131:18) set expiry. A token
-- minted more than 7 days before a session therefore EXPIRES BEFORE the session
-- happens, and a token for a session two hours out is valid for a pointless
-- 7 more days. Expiry is decoupled from the thing it protects.
--
-- FIX. Re-anchor expiry to the session's own start: expires_at = (next
-- occurrence start) + 3 hours. The anchor/expiry policy (cases a/b/c) lives in
-- ONE place, public.session_invite_expiry(uuid), so both mint paths — the RPC
-- here and the service-role mint in app/api/invites/session/route.ts (updated in
-- a later gate) — compute the same value and fail closed identically. Case (b)
-- (the 7-day floor) is restricted to TRUE recurring parents; a past recurring
-- CHILD falls through to case (c) and fails closed.
--
-- SCOPE / SAFETY.
--   * ADDITIVE + IDEMPOTENT: two CREATE OR REPLACE FUNCTIONs (same signatures /
--     SECURITY DEFINER) plus idempotent REVOKE/GRANT. No DROP, no ALTER, no data
--     mutation, no destructive statement.
--   * The column DEFAULT (now() + '7 days') is intentionally LEFT IN PLACE as a
--     floor for any insert path that omits expires_at. This migration does not
--     ALTER it.
--   * NO BACKFILL: on 2026-08-19, 31 of 32 live tokens are expired and every one
--     points at a past session; the single valid token already expires after its
--     session. There is nothing to correct.
--   * BACKWARD COMPATIBLE with the currently deployed client: create_session_invite
--     keeps its signature and return type; the deployed generateInviteLink() call
--     is unchanged. The only new failure mode (case c) fires solely when a caller
--     tries to invite to an already-started, non-recurring session, which is not a
--     normal share of an upcoming session. The deployed client already surfaces
--     RPC errors as a toast.
--   * NO type regeneration: no column shapes change.
--
-- TIMEZONE NOTE (the one place the review's MIN(date + start_time) formula
-- required interpretation). sessions.date is a DATE and sessions.start_time is a
-- TIME WITHOUT TIME ZONE holding Medellin wall-clock. `date + start_time` yields
-- a TIMESTAMP WITHOUT TIME ZONE; comparing it to now() (timestamptz) would cast
-- it using the DB session TimeZone, which is UTC on Supabase — a ~5h skew that
-- would expire a 6:00 AM session's token at ~4:00 AM. We therefore interpret the
-- wall-clock in 'America/Bogota' (fixed UTC-5, no DST) via AT TIME ZONE, which
-- yields the correct timestamptz. If tokens are ever minted for another city,
-- this literal must become per-session.
--
-- ============================================================================
-- ROLLBACK. Re-apply the two statements below to revert this migration.
--   (1) restore create_session_invite to its prior (migration 141) definition,
--       VERBATIM, and (2) drop the new helper.
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.create_session_invite(p_session_id uuid)
--  RETURNS text
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE v_token text;
-- BEGIN
--   IF auth.uid() IS NULL THEN
--     RAISE EXCEPTION 'not authorized to create an invite for this session'
--       USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF NOT EXISTS (
--     SELECT 1 FROM public.sessions s
--      WHERE s.id = p_session_id AND s.creator_id = auth.uid()
--   ) AND NOT EXISTS (
--     SELECT 1 FROM public.session_participants sp
--      WHERE sp.session_id = p_session_id
--        AND sp.user_id = auth.uid()
--        AND sp.status = 'confirmed'
--   ) THEN
--     RAISE EXCEPTION 'not authorized to create an invite for this session'
--       USING ERRCODE = 'insufficient_privilege';
--   END IF;
--   v_token := replace(gen_random_uuid()::text, '-', '');   -- 32 hex chars, crypto-secure
--   INSERT INTO public.invite_tokens (session_id, token, created_by) VALUES (p_session_id, v_token, auth.uid());
--   RETURN v_token;
-- END;
-- $function$;
--
-- DROP FUNCTION IF EXISTS public.session_invite_expiry(uuid);
-- ============================================================================


-- ── 1. Shared helper: the session-anchored expiry policy (cases a/b/c) ────────
-- Returns the expires_at a freshly minted invite token should carry for
-- p_session_id. Contains no authorization — the caller authorizes; this only
-- computes time.
--
-- SECURITY: the returned timestamptz IS the session's next occurrence start
-- (+3h) — that is real, non-public session data. So this helper must NOT be
-- directly callable by ordinary users: an authenticated user could otherwise
-- probe the next start time of any session by id. It is granted to service_role
-- ONLY (the API-route mint). create_session_invite reaches it via the SECURITY
-- DEFINER owner's privilege (both functions are owned by the migration role), so
-- no `authenticated` grant is needed or wanted.
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
  -- Anchor = MIN(date + start_time) across { this session } UNION
  -- { sessions whose recurring_parent_id = this session }, considering only
  -- occurrences whose start is still in the future. See TIMEZONE NOTE above for
  -- the AT TIME ZONE interpretation of the wall-clock columns.
  SELECT min((s.date + s.start_time) AT TIME ZONE 'America/Bogota')
    INTO v_anchor
    FROM public.sessions s
   WHERE (s.id = p_session_id OR s.recurring_parent_id = p_session_id)
     AND s.date IS NOT NULL
     AND s.start_time IS NOT NULL
     AND ((s.date + s.start_time) AT TIME ZONE 'America/Bogota') >= now();

  -- (a) A future occurrence exists → anchor to it, plus a 3h grace so a link
  --     accepted during the session still works.
  IF v_anchor IS NOT NULL THEN
    RETURN v_anchor + interval '3 hours';
  END IF;

  SELECT s.is_recurring, s.recurring_parent_id
    INTO v_is_recurring, v_recurring_parent_id
    FROM public.sessions s
   WHERE s.id = p_session_id;

  -- (b) TRUE recurring parent (is_recurring AND recurring_parent_id IS NULL)
  --     whose NEXT occurrence is not materialized yet: the recurring-sessions
  --     cron only generates child rows up to its LOOKAHEAD_DAYS window, so a
  --     genuine future occurrence can have no row to anchor to. Preserve the
  --     legacy mint+7d floor rather than fail a valid recurring series.
  --     Restricted to true parents on purpose: createChildSession writes child
  --     rows with is_recurring=false and recurring_parent_id=parent.id
  --     (lib/dal/sessions.ts:1030-1031), so a PAST child has no future anchor
  --     and MUST fall through to (c) — the recurring_parent_id IS NULL guard is
  --     what forces that, and also fails closed if a child ever drifts to
  --     is_recurring=true.
  --     KNOWN LIMITATION: if a true parent's real next occurrence is >7d out and
  --     unmaterialized, this token still expires early — acceptable until
  --     occurrences are generated further ahead.
  IF v_is_recurring IS TRUE AND v_recurring_parent_id IS NULL THEN
    RETURN now() + interval '7 days';
  END IF;

  -- (c) No future occurrence and not a true recurring parent → the session has
  --     already started (or is entirely in the past), or it is a past child.
  --     Fail closed; never mint a token that can only ever resolve to a dead
  --     session. Both mint paths inherit this.
  RAISE EXCEPTION 'cannot create an invite for a session that has already started'
    USING ERRCODE = 'check_violation';
END;
$function$;

-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon (and authenticated)
-- DIRECTLY on new public functions, so revoking from PUBLIC alone is not enough
-- (the T-SEC3 lesson). Lock it to service_role ONLY — see the SECURITY note on
-- the function above. authenticated is intentionally excluded: create_session_invite
-- is SECURITY DEFINER and reaches the helper via the owner's privilege.
REVOKE EXECUTE ON FUNCTION public.session_invite_expiry(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.session_invite_expiry(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.session_invite_expiry(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.session_invite_expiry(uuid) TO service_role;


-- ── 2. create_session_invite: authorize (unchanged), then mint with the
--       helper-computed expiry ───────────────────────────────────────────────
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
  -- ── Authorization (UNCHANGED from migration 141) ──────────────────────────
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

  -- ── D9: session-anchored expiry (shared policy; RAISES on case c). This call
  --    succeeds despite the helper being service_role-only: create_session_invite
  --    is SECURITY DEFINER, so it runs as its owner, which owns the helper. ─────
  v_expires_at := public.session_invite_expiry(p_session_id);

  -- ── Mint (now sets expires_at EXPLICITLY; the column default remains a floor
  --    for other insert paths) ────────────────────────────────────────────────
  v_token := replace(gen_random_uuid()::text, '-', '');   -- 32 hex chars, crypto-secure
  INSERT INTO public.invite_tokens (session_id, token, created_by, expires_at)
  VALUES (p_session_id, v_token, auth.uid(), v_expires_at);
  RETURN v_token;
END;
$function$;
