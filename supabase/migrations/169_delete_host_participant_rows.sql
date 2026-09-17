-- 169_delete_host_participant_rows.sql
--
-- T-ATH7, destructive half. Removes the 23 session_participants rows in which
-- a session's own host is recorded as a participant of that session.
--
-- NUMBERING: 168 is taken. supabase/migrations/168_revoke_users_location_from_anon.sql
-- exists on branch feat/168-revoke-users-location-anon, written and deliberately
-- HELD unapplied. This file is 169 so the two cannot collide if 168 lands first.
--
-- WHY THESE ROWS ARE WRONG
-- The convention, settled 2026-09-16: the host does NOT occupy a capacity seat,
-- and every count refers to athletes only. When an instructor says 10 spots they
-- mean 10 students. sessions.creator_id already records who hosts, so a
-- session_participants row for that same person is a second source of truth for
-- one fact -- and because trg_sync_session_participant_count (migration 087)
-- recomputes sessions.current_participants as count(*) WHERE status='confirmed',
-- the duplicate CONSUMES A REAL SEAT. On a full session that is one athlete who
-- cannot join.
--
-- The render half shipped first (commit 919e88c): ParticipantList, SessionCard
-- and AttendanceTracker now all filter the host out through
-- lib/sessionRoster.athleteRoster. That fixed the display and could not fix the
-- counter, because the counter is computed in the database from the rows
-- themselves. Until this migration runs, the rendered athlete count and
-- sessions.current_participants differ by one on these 23 sessions.
--
-- MEASURED ON PRODUCTION 2026-09-16T18:53Z, immediately before writing this:
--   rows where session_participants.user_id = sessions.creator_id ......... 23
--   ... AND status = 'confirmed' AND is_guest = false ..................... 23
--   ... rows matching the predicate but NOT the strict filter .............. 0
--   distinct sessions affected ............................................ 23
--   distinct creators ...................................................... 3
--   current_participants on every affected session ................... 1 -> 0
--   sessions where current_participants already equals the confirmed-row
--     count (i.e. the counter is currently consistent) ................. 23/23
--
-- Every one of the 23 is a session whose ONLY participant row is the host's own:
-- across the whole table there is ZERO overlap between "has a host row" (23
-- sessions) and "has at least one non-host athlete" (51 sessions). So this
-- deletes no row that sits beside a real athlete, and no guest row (a guest has
-- user_id NULL and can never equal creator_id).
--
-- The affected sessions, recorded so that a guard failure can be diffed against
-- what was measured rather than re-derived:
--   0731b40a-d8a4-4c2d-ba1b-73350a129495
--   171ea62e-e1de-479d-a4c1-f78b3c984012
--   1c5eb9ad-79e3-4ede-b558-c14096f58b6a
--   1de37d36-4759-4557-ae5f-2764f392a501
--   2036f5dc-9dcd-443e-b5c9-5ddc859f4002
--   21a301f1-3c77-4551-a527-00d38943362e
--   2f98b9f6-24fb-4f09-a147-53989252ad6c
--   3b07335a-7677-4d3d-9acb-6df47463c3b3
--   4f0d6030-6880-487a-a4f8-ba0f4fd00e5f
--   53dcb25f-d170-4e55-925b-bf36f39311c2
--   8e5f0115-66e1-408d-9907-1150697675a4
--   a073e38a-0975-4706-a861-a13613dd0d38
--   a7397483-410a-4bc0-a721-835251f82954
--   a90e344b-50ec-4e5d-b976-483a4b75bc32
--   ad03ad77-1307-4522-9974-67fe895bd9fd
--   adfc992f-a478-40c5-bc5f-507ce6a65723
--   b338cbe4-e37a-4f96-8e46-d917876fb2b8
--   bd9b09f7-cebc-4f75-8097-a87fc1ea79c5
--   c3867e07-9261-45f1-8cd9-cfcedd1f89d7
--   e375aa10-dce8-4b79-9081-0f1a751fcfb5
--   e51d0609-8fe2-4718-9385-0d3a9406a2e7
--   e59d9679-041e-4cac-ba16-af487719fb27
--   e8e2560e-b816-4bee-aa42-6ddbfcb4568a
--
-- SCOPE OF THE PREDICATE, and why it is narrower than "user_id = creator_id".
-- status='confirmed' and is_guest=false are asserted explicitly even though all
-- 23 rows satisfy them today. They are what was MEASURED, so they are what is
-- deleted. A host row that is pending, or somehow flagged as a guest, is not
-- something this migration looked at and not something it should quietly remove.
--
-- THE GUARD, AND WHY IT ACCEPTS 0 AS WELL AS 23
-- The count is checked before anything is deleted, and a mismatch aborts. 0 and
-- 23 are the two legitimate values:
--   23 -> production as measured. Delete them.
--    0 -> already applied, or a database rebuilt from these migrations, where
--         these rows never existed. Nothing to do; the migration is a no-op so
--         reruns and from-scratch rebuilds both succeed.
--   any other value -> a row appeared, or disappeared, between the measurement
--         and the apply. That is exactly the case that must NOT be swept along
--         with the known 23, so it raises and rolls back.
--
-- The guard and the DELETE live in ONE DO block on purpose. A DO block is a
-- single statement, so RAISE rolls the whole thing back and no partial delete
-- can survive a failed guard -- true whether or not the surrounding session is
-- in an explicit transaction, which matters because this is run by hand in the
-- Supabase SQL editor.
--
-- AFTER THE DELETE: trg_sync_session_participant_count fires per row and
-- recomputes sessions.current_participants from the surviving confirmed rows,
-- so the counter corrects itself to 0 on all 23 without this file touching
-- sessions at all. The rehearsal asserts that rather than assuming it.
--
-- THE CASCADE THAT FOLLOWS, stated so it is expected rather than discovered.
-- That counter UPDATE on public.sessions itself fires two more triggers:
--   trg_sessions_updated_at  (144) -- sessions.updated_at WILL move on all 23
--   trg_sessions_hosted_upd  (148) -- recomputes users.total_sessions_hosted,
--                                     which must come out unchanged, since no
--                                     sessions row is added or removed
-- Both are asserted in the rehearsal. Nothing else fires: the push triggers
-- that once sat on session_participants (on_join_request_created,
-- on_join_accepted) were dropped with their functions by migration 136, and no
-- surviving trigger on this table calls net.http_post -- so nothing escapes a
-- ROLLBACK, which is what makes the rehearsal safe to run against production.

DO $$
DECLARE
  v_expected  constant integer := 23;
  v_found     integer;
  v_deleted   integer;
BEGIN
  SELECT count(*) INTO v_found
  FROM public.session_participants sp
  JOIN public.sessions s ON s.id = sp.session_id
  WHERE sp.user_id = s.creator_id
    AND sp.status = 'confirmed'
    AND sp.is_guest = false;

  IF v_found = 0 THEN
    RAISE NOTICE '169: no host participant rows found -- already applied, or a fresh rebuild. Nothing to do.';
    RETURN;
  END IF;

  IF v_found <> v_expected THEN
    RAISE EXCEPTION
      '169 ABORTED: expected % host participant rows (measured on production 2026-09-16T18:53Z) but found %. '
      'A row was added or removed since the measurement. Re-measure and re-scope this migration before applying it; '
      'do NOT widen the guard.', v_expected, v_found;
  END IF;

  DELETE FROM public.session_participants sp
  USING public.sessions s
  WHERE s.id = sp.session_id
    AND sp.user_id = s.creator_id
    AND sp.status = 'confirmed'
    AND sp.is_guest = false;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Belt and braces: the guard counted with a JOIN, the DELETE matched with
  -- USING. If those two ever disagree the difference is silent, so it is
  -- asserted rather than trusted.
  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION '169 ABORTED: guard counted % rows but DELETE removed %.', v_expected, v_deleted;
  END IF;

  RAISE NOTICE '169: deleted % host participant rows. trg_sync_session_participant_count has recomputed current_participants for each affected session.', v_deleted;
END $$;
