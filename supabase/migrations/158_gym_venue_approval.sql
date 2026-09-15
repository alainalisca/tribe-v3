-- 158_gym_venue_approval.sql
--
-- T-GYM1: link a session to a gym, with the gym's approval.
--
-- WHAT
--   sessions.partner_id           FK to featured_partners. The venue the
--                                 instructor picked. NULL = not at a partner.
--   sessions.partner_status       'pending' | 'approved' | 'declined'.
--   sessions.partner_reviewed_at  when the gym decided.
--   featured_partners.auto_approve_roster  default true: roster coaches skip
--                                 the queue.
--
-- The gym owns its name: identity renders only when partner_status='approved'
-- AND the partner is active, so a session cannot borrow a gym's brand.
--
-- ── WHY TWO RPCs AND NOT AN RLS POLICY ──────────────────────────────────────
-- The spec asks for "only the gym's user (and admins) can move partner_status;
-- the creator cannot", written as a policy. A policy alone CANNOT express that.
-- RLS is row-level: an UPDATE policy's USING sees the old row and WITH CHECK
-- the new row, and neither can compare the two, so no policy can say "this role
-- may update every column except these". The existing policy
--     "Users can update own sessions" FOR UPDATE USING (auth.uid() = creator_id)
-- is permissive, and permissive policies are OR'd -- adding another cannot take
-- away what it already grants.
--
-- So the guarantee is column privileges plus SECURITY DEFINER, which is how
-- dismiss_banner (156) already works here:
--   * authenticated loses UPDATE on partner_status and partner_reviewed_at, so
--     a direct PATCH from any client fails no matter who sends it;
--   * set_session_partner() lets the creator choose a venue and computes the
--     status server-side, so the creator can never pick their own answer;
--   * review_venue_request() lets ONLY the gym's owner (or an admin) decide.
-- partner_id stays writable by the creator: choosing a venue is theirs, the
-- verdict is not.
--
-- Per 093's lesson, a column-level REVOKE cannot remove a table-level grant, so
-- the UPDATE privilege is rebuilt the 066 way: revoke at table level, then
-- re-grant column by column from the LIVE catalog (never from
-- lib/database.types.ts, which 137 records as being three columns out of date).
--
-- ── GRANTS ON THE NEW COLUMNS ───────────────────────────────────────────────
-- Verified against production before writing this (has_column_privilege, not
-- information_schema.column_privileges, which cannot see table-level grants):
--   anon_sessions_table=false   auth_sessions_table=true
--   anon_fp_table=true          auth_fp_table=true
-- 140 is applied: anon cannot read public.sessions at all and reads through
-- sessions_public. So anon needs no column grant here, but the VIEW must carry
-- the three columns or signed-out visitors -- the Instagram traffic this ticket
-- exists for -- would never see the gym. authenticated already holds table-level
-- SELECT, so its GRANT below is belt-and-braces: it is a no-op today and the
-- thing that keeps this working if sessions ever gets the 066 treatment.

-- ── THIS RECREATES YESTERDAY'S TRAP, FOR WRITES ─────────────────────────────
-- 156 added two columns to a table under column-level SELECT grants, granted
-- neither, and the client could not read them -- three attempts to find it,
-- because a mocked DAL cannot see a permission error. This migration puts
-- public.sessions under column-level INSERT and UPDATE grants, so from here on
-- a column added to sessions is NOT writable by authenticated until it is
-- granted, and it will fail in production while every test passes.
--
-- 066 wrote that rule as a comment in its header and it was missed. So the
-- enforcement here is not this paragraph. It is two guards:
--   * supabase/verify-migration-state.sql -- GUARD_sessions_columns_writable
--     asserts every column outside the two verdict columns is insertable and
--     updatable by authenticated, via has_column_privilege (never
--     information_schema.column_privileges, which cannot see table-level
--     grants and returns the same answer whether a column is readable or not).
--   * supabase/verify-migration-state.test.ts -- fails the BUILD when a
--     migration after 158 adds a sessions column without a GRANT.
-- Read those two before adding a column to this table.

-- ── COLUMNS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS partner_id UUID NULL REFERENCES public.featured_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_status TEXT NULL
    CHECK (partner_status IN ('pending', 'approved', 'declined')),
  ADD COLUMN IF NOT EXISTS partner_reviewed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_partner_status
  ON public.sessions (partner_id, partner_status);

ALTER TABLE public.featured_partners
  ADD COLUMN IF NOT EXISTS auto_approve_roster BOOLEAN NOT NULL DEFAULT TRUE;

GRANT SELECT (partner_id, partner_status, partner_reviewed_at)
  ON public.sessions TO authenticated;
GRANT SELECT (auto_approve_roster) ON public.featured_partners TO authenticated, anon;

-- ── WRITE PRIVILEGE: everything except the verdict ──────────────────────────
-- BOTH insert and update. INSERT is a separate privilege from UPDATE, so
-- revoking only UPDATE would leave the whole guarantee bypassable by creating
-- the session with partner_status = 'approved' in the initial insert. Verified
-- that no client insert names those columns today (lib/dal/sessions.ts:869 and
-- :1240 both build explicit payloads), so this costs nothing and closes the
-- hole permanently.
--
-- Enumerated from the LIVE catalog. Trusting lib/database.types.ts here would
-- have silently dropped community_id, early_access_only_until and
-- waitlist_count -- the three columns 137's header records the types file as
-- missing -- which would have broken every recurring-session write and every
-- waitlist update in production while every mocked test stayed green.
DO $$
DECLARE cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'sessions'
    AND column_name NOT IN ('partner_status', 'partner_reviewed_at');

  IF cols IS NULL THEN
    RAISE EXCEPTION 'no columns found on public.sessions; refusing to apply';
  END IF;

  EXECUTE 'REVOKE UPDATE ON public.sessions FROM authenticated';
  EXECUTE 'GRANT UPDATE (' || cols || ') ON public.sessions TO authenticated';
  EXECUTE 'REVOKE INSERT ON public.sessions FROM authenticated';
  EXECUTE 'GRANT INSERT (' || cols || ') ON public.sessions TO authenticated';
END $$;

-- ── THE APPROVAL RULE, SERVER-SIDE ──────────────────────────────────────────
-- Creator picks a venue. Status is computed here, never sent by the client.
--   creator is the gym's own user                        -> approved
--   creator is an active roster member AND auto-approve   -> approved
--   otherwise                                             -> pending
-- Passing NULL clears all three columns (venue moved away from a gym).
CREATE OR REPLACE FUNCTION public.set_session_partner(
  p_session_id UUID,
  p_partner_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator UUID;
  v_owner UUID;
  v_auto BOOLEAN;
  v_status TEXT;
BEGIN
  SELECT creator_id INTO v_creator FROM public.sessions WHERE id = p_session_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'session not found';
  END IF;
  IF v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'only the session creator can set its venue';
  END IF;

  IF p_partner_id IS NULL THEN
    UPDATE public.sessions
    SET partner_id = NULL, partner_status = NULL, partner_reviewed_at = NULL
    WHERE id = p_session_id;
    RETURN NULL;
  END IF;

  SELECT user_id, auto_approve_roster INTO v_owner, v_auto
  FROM public.featured_partners
  WHERE id = p_partner_id AND status = 'active';

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'partner not found or not active';
  END IF;

  IF v_creator = v_owner THEN
    v_status := 'approved';
  ELSIF v_auto AND EXISTS (
    SELECT 1 FROM public.partner_instructors
    WHERE partner_id = p_partner_id AND instructor_id = v_creator AND is_active
  ) THEN
    v_status := 'approved';
  ELSE
    v_status := 'pending';
  END IF;

  UPDATE public.sessions
  SET partner_id = p_partner_id,
      partner_status = v_status,
      partner_reviewed_at = CASE WHEN v_status = 'approved' THEN NOW() ELSE NULL END
  WHERE id = p_session_id;

  RETURN v_status;
END $$;

-- Only the gym's owner, or an admin, decides. The creator cannot reach this:
-- the ownership test is on featured_partners.user_id, not on the session.
CREATE OR REPLACE FUNCTION public.review_venue_request(
  p_session_id UUID,
  p_decision TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner UUID;
BEGIN
  IF p_decision NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'decision must be approved or declined';
  END IF;

  SELECT fp.user_id INTO v_owner
  FROM public.sessions s
  JOIN public.featured_partners fp ON fp.id = s.partner_id
  WHERE s.id = p_session_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'session has no partner venue';
  END IF;

  IF v_owner <> auth.uid() AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'only the venue owner can review this request';
  END IF;

  UPDATE public.sessions
  SET partner_status = p_decision, partner_reviewed_at = NOW()
  WHERE id = p_session_id;
END $$;

REVOKE ALL ON FUNCTION public.set_session_partner(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_venue_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_session_partner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_venue_request(UUID, TEXT) TO authenticated;

-- ── THE ANON READ PATH ──────────────────────────────────────────────────────
-- Re-created verbatim from 138 with the three partner columns appended. Signed-
-- out visitors are the primary audience for this ticket, and 140 made this view
-- their only read path, so omitting the columns here would hide gym identity
-- from exactly the people BullBox sends.
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
  round(s.location_lng::numeric, 3) AS location_lng,
  -- T-GYM1
  s.partner_id,
  s.partner_status,
  s.partner_reviewed_at
FROM public.sessions s
LEFT JOIN public.users u ON u.id = s.creator_id
-- invite_only sessions are EXCLUDED from the anon view (see 138's header). IS
-- DISTINCT FROM (not <>) so a NULL join_policy -- an unset, non-private session
-- -- stays discoverable rather than being dropped by NULL-comparison semantics.
WHERE s.join_policy IS DISTINCT FROM 'invite_only';

GRANT SELECT ON public.sessions_public TO anon, authenticated;

COMMENT ON COLUMN public.sessions.partner_id IS
  'Venue: the featured_partners row this session is hosted at (T-GYM1).';
COMMENT ON COLUMN public.sessions.partner_status IS
  'Gym approval for using its identity. Only set_session_partner/review_venue_request may write it (T-GYM1).';
COMMENT ON FUNCTION public.review_venue_request(UUID, TEXT) IS
  'Approve or decline a venue request. Gym owner or admin only (T-GYM1).';
