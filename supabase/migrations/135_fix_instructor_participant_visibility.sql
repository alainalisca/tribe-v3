-- 135_fix_instructor_participant_visibility.sql
-- HOTFIX for a regression introduced by migration 129 (RLS-H3 Gate 3).
--
-- 129 replaced the qual:true SELECT policies on session_participants with the
-- narrow sp_select_own (user_id = auth.uid()). That is correct for reads, but it
-- silently broke every HOST action on ANOTHER user's row:
--
--   UPDATE ... WHERE id = X  must first FIND the row, and row lookup is governed by
--   the SELECT policy. A host cannot see the athlete's row, so the WHERE matches
--   nothing -> 0 rows affected -> the UI shows "No se pudo aprobar solicitud".
--
-- Live-reproduced against production: host PATCH -> HTTP 204, content-range */0,
-- and the row's status stayed 'pending'. Broken host actions:
--   * approve a pending request (UPDATE)
--   * decline a request        (DELETE by id)
--   * remove/kick a participant(DELETE by session_id + user_id)
-- Self-leave was unaffected (the user owns that row, so sp_select_own matches).
--
-- The two instructor WRITE policies were already live and correct:
--   sp_update_payment_by_instructor (UPDATE)  and  sp_delete_by_instructor (DELETE)
-- both scoped to EXISTS(sessions WHERE id = session_id AND creator_id = auth.uid()).
-- They just had no matching read visibility. This adds exactly that, and nothing more.
--
-- NOT a loosening: identical scope to those two policies — a host sees participants
-- of THEIR OWN sessions only. Not auth.uid() IS NOT NULL, not qual:true.
--
-- Does NOT reopen RLS-H3:
--   * Guest PII (guest_phone/guest_email/guest_token) stays unreadable — migration
--     130 revoked those COLUMNS from authenticated. A column privilege is not a
--     policy; no SELECT policy can override it. Hosts included.
--   * anon is untouched: still no SELECT policy and no table grant -> 401.
--   * sp_select_own is left exactly as-is.

DROP POLICY IF EXISTS "sp_select_by_instructor" ON public.session_participants;
CREATE POLICY "sp_select_by_instructor" ON public.session_participants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = session_participants.session_id
        AND sessions.creator_id = auth.uid()
    )
  );
