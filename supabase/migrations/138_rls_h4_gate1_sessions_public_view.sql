-- 138_rls_h4_gate1_sessions_public_view.sql
--
-- RLS-H4 Gate 1 (ADDITIVE — creates the view + reprojects one RPC; changes no
-- grant on the base table, so nothing an anon reader does today breaks).
--
-- public.sessions is world-readable to anon (sessions_select_policy is {public}
-- USING true, plus an anon table SELECT grant). Migration 137 removed only
-- payment_instructions. Anon can still read: exact coordinates (up to 14 dp),
-- creator_id, the two invite_only sessions in full (street address + coords),
-- and every internal/ops column.
--
-- The design intent is a VIEW, not another column revoke: a column revoke closes
-- today's leak but a NEW column is anon-readable the instant it exists (exactly
-- how payment_instructions became public). The view inverts the default — new
-- sessions columns are PRIVATE until deliberately added here.
--
-- Product decisions baked in:
--   * coordinates rounded to 3 dp (~78 m at Medellin) for anon; exact stays
--     behind the base table, which only authenticated/service-role read
--   * invite_only sessions are EXCLUDED entirely (not just location-stubbed):
--     "invite_only" means "private, requires direct invitation" (CLAUDE.md), so
--     it must be genuinely undiscoverable, not merely location-hidden. The row's
--     existence, sport, date and host are private too. The ONLY anon path that
--     renders an invite_only session is /invite/[token] via validate_invite_token
--     (token possession = authorization). A /s/[session-id] share link to an
--     invite_only session therefore returns "not found" for anon, by design.
--   * host flattened to name/avatar/id (a view has no FK, so the
--     creator:users!fk embed callers use today cannot resolve against it)
--
-- This is Gate 1 of three. Gate 2 (code reroute of every anon reader) ships in
-- the SAME PR. Gate 3 (REVOKE SELECT ON sessions FROM anon) is a SEPARATE, later
-- migration with an attestation preflight — do NOT fold it in here.

-- ── THE VIEW ───────────────────────────────────────────────────────────────
-- security_invoker = false (the PG15 default, stated explicitly): the view
-- executes as its OWNER, so it keeps reading the raw columns after Gate 3
-- revokes them from anon. Supabase's linter flags this as a security-definer
-- view; that is intentional and required, same as users_discoverable (114) and
-- session_participants_roster (127).
CREATE OR REPLACE VIEW public.sessions_public
WITH (security_invoker = false) AS
SELECT
  s.id,
  s.title,
  s.sport,
  s.date,
  s.start_time,
  s.end_time,
  s.duration,
  s.description,
  s.equipment,
  s.skill_level,
  s.photos,
  s.max_participants,
  s.current_participants,
  s.waitlist_count,
  s.join_policy,
  s.status,
  s.is_paid,
  s.price_cents,
  s.currency,
  s.creator_id,
  u.name AS creator_name,
  u.avatar_url AS creator_avatar_url,
  u.average_rating AS creator_average_rating,
  s.location,
  -- BOTH coordinate pairs rounded to 3dp; different consumers read different
  -- pairs, so rounding only one would leak precise coords through the other.
  -- round() has no (double precision, int) overload -> ::numeric cast.
  round(s.latitude::numeric, 3) AS latitude,
  round(s.longitude::numeric, 3) AS longitude,
  round(s.location_lat::numeric, 3) AS location_lat,
  round(s.location_lng::numeric, 3) AS location_lng
FROM public.sessions s
LEFT JOIN public.users u ON u.id = s.creator_id
-- invite_only sessions are EXCLUDED from the anon view (see header). IS DISTINCT
-- FROM (not <>) so a NULL join_policy — an unset, non-private session — stays
-- discoverable rather than being dropped by NULL-comparison semantics.
WHERE s.join_policy IS DISTINCT FROM 'invite_only';

COMMENT ON VIEW public.sessions_public IS
  'RLS-H4 anon-facing projection of public.sessions. Coordinates rounded to 3dp; '
  'invite_only rows location-stubbed; payment_instructions, verification, and '
  'operational columns excluded by omission. New sessions columns are PRIVATE '
  'until deliberately added here. Owner-executed (security_invoker=false) so it '
  'survives the Gate 3 anon revoke.';

-- CRITICAL: Supabase default privileges grant SELECT on new public objects to
-- anon DIRECTLY (not via PUBLIC), so REVOKE ... FROM PUBLIC alone leaves it
-- readable by the anon key. anon must be named explicitly. (Bitten 4x:
-- T-SEC3/5, 127, 130.) anon is then GRANTED back intentionally — this view IS
-- the anon read path.
REVOKE ALL ON public.sessions_public FROM PUBLIC, anon;
GRANT SELECT ON public.sessions_public TO anon, authenticated;

-- ── validate_invite_token: stop returning the whole row ──────────────────────
-- Previously it returned to_jsonb() of the entire sessions row (all 50 columns incl.
-- payment_instructions and exact coords) to anon, since the function is
-- SECURITY DEFINER and bypasses column grants. That defeated 137 and would
-- defeat this view.
--
-- It now projects the same SAFE column set the view exposes (no
-- payment_instructions, no ops columns), with coordinates rounded to 3 dp. But
-- it does NOT apply the invite_only stub: holding the token IS the
-- authorization, so the invited user sees the real location — stubbing it would
-- defeat the invitation, and invite tokens are overwhelmingly for invite_only
-- sessions. The invite page renders a neighborhood label from these, not a
-- precise pin, so 3 dp is visually identical.
CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE v_row public.invite_tokens%ROWTYPE; v_session jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO v_row FROM public.invite_tokens WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired', 'session_id', v_row.session_id);
  END IF;

  -- Explicit projection, not the whole row: the fields the invite page renders,
  -- location un-stubbed (token = authorization), coords at 3dp, no
  -- payment_instructions, no operational columns.
  SELECT jsonb_build_object(
    'id', s.id,
    'sport', s.sport,
    'title', s.title,
    'date', s.date,
    'start_time', s.start_time,
    'duration', s.duration,
    'description', s.description,
    'location', s.location,
    'location_lat', round(s.location_lat::numeric, 3),
    'location_lng', round(s.location_lng::numeric, 3),
    'is_paid', s.is_paid,
    'price_cents', s.price_cents,
    'currency', s.currency,
    'current_participants', s.current_participants,
    'max_participants', s.max_participants,
    'join_policy', s.join_policy
  )
  INTO v_session
  FROM public.sessions s
  WHERE s.id = v_row.session_id;

  RETURN jsonb_build_object(
    'valid', true,
    'session_id', v_row.session_id,
    'created_by', v_row.created_by,
    'expires_at', v_row.expires_at,
    'session', v_session
  );
END;
$$;
