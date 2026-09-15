-- 167_lock_session_attendance_reads.sql
--
-- EXPOSURE (measured live): public.session_attendance carries a SELECT policy
-- "Anyone can view attendance" with USING (true) for role public, and anon
-- holds SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER. The
-- read leak is total: anyone on the internet with the public anon key gets
-- every row. Confirmed by an anon REST read returning content-range 0-0/11.
--
-- What leaks today is 11 rows of (session_id, user_id, attended, created_at) --
-- a small co-attendance graph tying 8 real user ids to 5 session ids, readable
-- with no account. That is the same co-attendance signal T-ATH1 places behind
-- its highest visibility tier.
--
-- notes, marked_by and marked_at are ALL NULL on all 11 rows, and no code path
-- writes them: the only writer is upsertAttendance (lib/dal/live.ts:141, called
-- from AttendanceTracker.tsx:124) and it sets session_id, user_id and attended
-- only. They are deliberately NOT dropped here -- additive first, destructive
-- last. If the product question resolves in favour of keeping a real attendance
-- record, notes is what a host would use. Revoked now, droppable later after a
-- bake period.
--
-- WRITES ARE ALREADY SAFE AND ARE NOT TOUCHED. The existing INSERT WITH CHECK
-- and UPDATE USING both require sessions.creator_id = auth.uid(), which is null
-- for anon. There is no DELETE policy, so RLS default-denies deletes. Of anon's
-- grants only TRUNCATE escapes RLS, and PostgREST does not expose TRUNCATE --
-- but the grant is removed anyway, because "the API does not expose it" is a
-- property of the client, not of the database.
--
-- WHY THE OR DOES NOT NEED A COLUMN-PRIVILEGE WORKAROUND
-- Migration 159's finding: Postgres checks column privileges for the WHOLE
-- policy expression, so an OR does not short-circuit on a true branch, and a
-- policy naming a revoked column refuses the read outright. The creator branch
-- below reads sessions.creator_id. That is safe here for two reasons, in order
-- of strength: the existing INSERT and UPDATE policies on this table already
-- use exactly that predicate and work in production today; and SELECT on
-- public.sessions was revoked from anon only (137, 140) -- authenticated
-- retains table-wide SELECT, with no column-level revoke of creator_id.
-- is_app_admin() is SECURITY DEFINER (add_admin_rls.sql), so its read of
-- users.is_admin survives migration 113's revoke -- that is the whole reason
-- 159 exists.
--
-- Reversible:
--   DROP POLICY "sa_select_own_or_host" ON public.session_attendance;
--   CREATE POLICY "Anyone can view attendance" ON public.session_attendance
--     FOR SELECT TO public USING (true);
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON public.session_attendance TO anon;
-- (You will not want to.)
--
-- Rehearsal: supabase/rehearsals/167_lock_session_attendance_reads_REHEARSAL.sql
-- DEPENDS ON: 166 (capture). Do not run this before 166.

-- ── 1. Replace the open read policy ────────────────────────────────────────
-- Every reader of this table is own-user, session-host, or the service role:
--   own user  -- StreakBanner.tsx:46 (home), AchievementBadges.tsx:110,131
--               (/profile, /my-training), get_user_attendance_stats
--   host      -- fetchAttendanceForSession (lib/dal/live.ts:122), used by
--               AttendanceTracker.tsx:91 and useSessionDetail.ts:265
--   service   -- fetchSessionAttendance (lib/dal/live.ts:174), called by
--               /api/cron/post-session-followups, which bypasses RLS
-- No reader needs anon and no reader needs cross-user visibility.
--
-- TO authenticated, not TO public: with no policy covering anon, the anon role
-- gets zero rows even if a SELECT grant is ever restored by accident. Same
-- belt-and-braces posture as 129's sp_select_own.

DROP POLICY IF EXISTS "Anyone can view attendance" ON public.session_attendance;

DROP POLICY IF EXISTS "sa_select_own_or_host" ON public.session_attendance;
CREATE POLICY "sa_select_own_or_host"
  ON public.session_attendance
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_attendance.session_id
        AND s.creator_id = auth.uid()
    )
    OR public.is_app_admin()
  );

-- ── 2. Admin policy: helper, not a hardcoded email ─────────────────────────
-- The live admin policy hardcodes one operator's email address instead of
-- calling public.is_app_admin(). Two problems: it grants on identity rather
-- than on the is_admin flag, so it does not follow the admin model the rest of
-- the schema uses; and it reads auth.users.email inside a policy expression,
-- which is the 159 failure mode waiting to happen.
--
-- The policy is found by what it DOES, not by its name: its name is not in git
-- (this table has never been in a migration) and matching on a name we guessed
-- would silently no-op. pg_policies.qual and .with_check contain policy
-- expressions only, never this file's comments, so scanning them cannot match
-- the migration's own prose -- the trap CLAUDE.md records for migration 165.
--
-- It is dropped and reissued as FOR ALL, matching the capability it has today.
-- If the capture in 166 shows the live policy is narrower than FOR ALL, narrow
-- this to match and say so here rather than widening admin reach by accident.
DO $$
DECLARE
  r record;
  v_found int := 0;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'session_attendance'
      AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%aplusfitnessllc.com%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.session_attendance', r.policyname);
    v_found := v_found + 1;
  END LOOP;

  IF v_found = 0 THEN
    RAISE NOTICE
      'No session_attendance policy contained a hardcoded email. Either it was '
      'already fixed or the predicate differs from what was measured. Verify '
      'against the 166 capture before assuming this was a no-op.';
  ELSE
    RAISE NOTICE 'Dropped % hardcoded-email policy/policies on session_attendance.', v_found;
  END IF;
END $$;

DROP POLICY IF EXISTS "sa_admin_manage" ON public.session_attendance;
CREATE POLICY "sa_admin_manage"
  ON public.session_attendance
  FOR ALL
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- ── 3. Narrow the grants ───────────────────────────────────────────────────
-- The 166 capture changed this section. Both anon AND authenticated hold all
-- seven of SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and
-- each is a DIRECT grant to the role -- not inherited from PUBLIC. So
-- `REVOKE ... FROM PUBLIC` does not remove them, and an earlier draft of this
-- file that revoked only anon + PUBLIC would have left authenticated holding
-- TRUNCATE. The rehearsal's authenticated_privileges_exact check is what
-- catches that, and it is why the capture runs before the lockdown.
--
-- TRUNCATE is the privilege that matters most here: it is the only one in the
-- set that escapes RLS entirely. A policy fix that leaves TRUNCATE granted has
-- not closed the table. PostgREST does not expose TRUNCATE today, but that is a
-- property of the client, not of the database.
--
-- REVOKE ALL is used rather than naming privileges, so a privilege added to
-- this table in future is removed too rather than silently surviving.
REVOKE ALL ON public.session_attendance FROM anon;
REVOKE ALL ON public.session_attendance FROM authenticated;
-- FROM PUBLIC as well: a grant to PUBLIC is inherited by every role including
-- anon, so revoking only the named roles can leave one in place. That is the
-- "Supabase anon default-grant trap" recorded in project memory, hit four times
-- on this project. Harmless here (the capture shows no PUBLIC grant), kept
-- because its absence is the kind of thing that changes without anyone noticing.
REVOKE ALL ON public.session_attendance FROM PUBLIC;

-- Re-grant only what the application actually uses. Verified against every
-- call site: the table is read with .select(), written with .insert() and
-- .update(), and nothing anywhere deletes from it.
GRANT SELECT, INSERT, UPDATE ON public.session_attendance TO authenticated;

-- service_role is deliberately untouched. It bypasses RLS by design and is how
-- /api/cron/post-session-followups reads this table (fetchSessionAttendance,
-- lib/dal/live.ts:174). Revoking from it would break that cron.
--
-- NOT re-granted to authenticated: DELETE (no DELETE policy exists, so RLS
-- default-denies it anyway -- the grant only ever misled a reader into thinking
-- deletes were possible), TRUNCATE (escapes RLS), REFERENCES and TRIGGER (no
-- client needs to create constraints or triggers).

COMMENT ON POLICY "sa_select_own_or_host" ON public.session_attendance IS
  '167: replaces "Anyone can view attendance" (USING (true) TO public), which '
  'let the anon key read every row. Own rows, rows on a session you created, or '
  'app admin. TO authenticated so anon has no policy at all.';
