-- 152_scope_participant_roster.sql
-- Scope session_participants_roster to the people entitled to see a named roster.
--
-- THE HOLE: 127 created (and 128 last redefined) session_participants_roster
-- WITH (security_invoker = false), so it runs as owner and bypasses the RLS that
-- 129 (Gate 3) put on session_participants. It is GRANTed SELECT to authenticated
-- with NO viewer-scoping WHERE clause, so any authenticated user can read the
-- full confirmed roster (names + avatars) of ANY session by id. A client gate
-- alone cannot close this because the grant is table-level, not row-level.
--
-- THE RULE (product decision): a row is visible only when the current viewer is
-- the session's creator, or is themselves a confirmed participant of that same
-- session. Everyone else, including other logged in users, gets zero rows.
--
-- security_invoker DECISION: keep security_invoker = false and add an auth.uid()
-- WHERE clause, rather than flipping to security_invoker = true with base-table
-- RLS. Reasons:
--   1. The view exists BECAUSE it is owner-executed: 129 revoked the guest-PII
--      columns and locked session_participants to own-rows-only (sp_select_own:
--      user_id = auth.uid()). Flipping to security_invoker = true would run the
--      view as the caller, so it would return only the viewer's OWN participant
--      row (not the roster) and would fail on the revoked columns. Restoring the
--      roster under invoker semantics would require a much broader base-table
--      SELECT policy, re-widening exactly what Gate 3 narrowed.
--   2. The scoping is a projection concern; keeping it in the view leaves the raw
--      table's tight own-rows-only policy untouched.
-- So the fix is entirely inside the view: same owner execution, same columns,
-- same grants, plus a WHERE.
--
-- SERVICE ROLE / SERVER SIDE: auth.uid() is NULL when there is no end-user JWT
-- (service_role connections, server jobs). Under this WHERE that yields zero
-- rows. That is acceptable here because NOTHING server side reads this view: the
-- only readers are browser-client, end-user calls (fetchSessionWithDetails,
-- fetchConfirmedParticipantsWithUsers, fetchParticipantsForSessions,
-- fetchPendingParticipantsForSession(s)). A future service-role job that needs
-- the full roster must read the base table directly (service_role bypasses RLS)
-- or a dedicated SECURITY DEFINER RPC, NOT this view.
--
-- ADMIN NOTE (flagged deviation from the literal "host + confirmed participants
-- only" decision): app admins moderate any session across the app today
-- (session page canKick / canModerate and AttendanceTracker all key off
-- userIsAdmin), and the sibling object session_payment_roster (128) already
-- authorizes `creator OR public.is_app_admin()`. Omitting admins here would
-- silently break admin attendance and moderation on sessions they do not own.
-- So this view includes `public.is_app_admin()`, matching that convention. If
-- the intent is to exclude admins too, delete that one predicate below.
--
-- Column set is UNCHANGED from 128. Grants are UNCHANGED (authenticated only;
-- anon still revoked); re-asserted defensively because CREATE OR REPLACE VIEW on
-- a new object surface can re-trigger Supabase's anon default-grant.

CREATE OR REPLACE VIEW public.session_participants_roster
WITH (security_invoker = false) AS
SELECT
  sp.id,
  sp.session_id,
  sp.user_id,
  sp.status,
  sp.is_guest,
  sp.guest_name,
  sp.joined_at,
  u.id                 AS user_profile_id,
  u.name               AS user_name,
  u.avatar_url         AS user_avatar_url,
  u.preferred_language AS user_preferred_language
FROM public.session_participants sp
LEFT JOIN public.users u ON u.id = sp.user_id
WHERE
  -- App admins keep moderation reach (matches session_payment_roster; see note).
  public.is_app_admin()
  -- The session's creator sees the full roster of their own session.
  OR EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = sp.session_id
      AND s.creator_id = auth.uid()
  )
  -- A confirmed participant sees the full roster of that same session.
  OR EXISTS (
    SELECT 1
    FROM public.session_participants me
    WHERE me.session_id = sp.session_id
      AND me.user_id = auth.uid()
      AND me.status = 'confirmed'
  );

COMMENT ON VIEW public.session_participants_roster IS
  'RLS-H3 + 152: authenticated roster projection of session_participants. Identities '
  '+ guest DISPLAY name + status only; NO guest_phone/guest_email/guest_token, NO '
  'payment_*. Owner-executed so it survives the Gate 3 column revoke. Row-scoped: '
  'visible only to the session creator, a confirmed participant of that session, or '
  'an app admin. authenticated only; no anon.';

-- Grants unchanged: anon stays revoked (belt-and-suspenders vs Supabase default
-- anon grant on replaced objects), authenticated keeps SELECT. Row visibility is
-- enforced by the WHERE above, not by the grant.
REVOKE ALL ON public.session_participants_roster FROM PUBLIC, anon;
GRANT SELECT ON public.session_participants_roster TO authenticated;
