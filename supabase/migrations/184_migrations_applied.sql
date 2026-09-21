-- 184_migrations_applied.sql
--
-- A record, in the database, of which migrations have run.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS, WITH THE EVIDENCE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Applied state was being kept in a person's head and in an assistant's notes.
-- On 2026-09-21 that record was wrong about migration 181 -- recorded as
-- unapplied when it had already run and returned instructors_now_excluded: 18.
--
-- That single wrong entry manufactured an entire false design conflict: a
-- proposed guard appeared to collide with the immutability test, and the
-- collision existed only in the stale record. The drift was hours old.
--
-- So applied-state stops being hand-maintained. It is a fact about the
-- database, and it now lives in the database.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FROZEN AND APPLIED ARE DIFFERENT FACTS, AND ONE FILE CANNOT MEAN BOTH
-- ═══════════════════════════════════════════════════════════════════════════
--
--   FROZEN  (supabase/migrations_frozen.json) -- "this SQL is final".
--           Set on MERGE. Enforced by migrationImmutability.test.ts, which
--           hashes the executable text. It is a property of the repository.
--
--   APPLIED (this table) -- "this ran against production, at this time".
--           Set when a human runs it. It is a property of the database, and
--           the repository cannot know it.
--
-- Forcing migrations_frozen.json to carry both is what produced the apparent
-- conflict above. They are now separate, and each is recorded where it is
-- true.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EVERY MIGRATION FROM 185 ONWARD ENDS BY RECORDING ITSELF
-- ═══════════════════════════════════════════════════════════════════════════
--
--   INSERT INTO public.migrations_applied (migration)
--   VALUES ('185_whatever') ON CONFLICT (migration) DO NOTHING;
--
-- DO NOTHING, not DO UPDATE. These files are re-run -- to confirm they took,
-- after a dropped connection, during a rebuild -- and every migration here is
-- written to be idempotent for that reason. DO UPDATE would overwrite the
-- first-run timestamp with the most recent re-paste, and FIRST run is the one
-- that answers "when did this reach production", which is the only question
-- the record exists for.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NO CLIENT WRITE GRANT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Same reasoning as lead_credits in migration 178: a record of what ran that
-- any authenticated user can write is not a record. Supabase grants new public
-- objects to anon and authenticated DIRECTLY, so REVOKE FROM PUBLIC is not
-- enough and both roles are named -- the T-SEC3 trap this repo has hit four
-- times.
--
-- SELECT is granted to nobody either. The consumers are the SQL editor
-- (postgres) and server-side code holding the service-role key; the drift
-- detector is one of those. If a client surface ever needs to read it, that is
-- its own migration with the surface named.

CREATE TABLE IF NOT EXISTS public.migrations_applied (
  migration   text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  -- Free text, for the cases the filename cannot carry: "applied as 176,
  -- renumbered", "re-run after connection drop", "backfilled from memory".
  note        text
);

COMMENT ON TABLE public.migrations_applied IS
  'Which migrations have run against THIS database, and when. Applied-state is '
  'a property of the database; migrations_frozen.json is a property of the '
  'repository ("this SQL is final"). Separate facts, separate homes.';

ALTER TABLE public.migrations_applied ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.migrations_applied FROM PUBLIC;
REVOKE ALL ON public.migrations_applied FROM anon;
REVOKE ALL ON public.migrations_applied FROM authenticated;

-- ── Backfill: everything that has run, as of 2026-09-21 ────────────────────
-- applied_at is the DEFAULT (now()) rather than an invented timestamp. The
-- real run times are not recoverable, and a fabricated one is worse than an
-- obviously-approximate one -- the note says so for each.
INSERT INTO public.migrations_applied (migration, note) VALUES
  ('179_users_cover_image_url',                    'backfilled 2026-09-21; applied earlier, exact time not recorded'),
  ('180_find_training_partners_rpc',               'backfilled 2026-09-21; applied earlier, exact time not recorded'),
  ('181_find_training_partners_exclude_instructors','backfilled 2026-09-21; returned instructors_now_excluded: 18'),
  ('182_notifications_action_url',                 'backfilled 2026-09-21; applied ~16:50 UTC to end a notification-insert outage'),
  ('183_google_avatar_full_size',                  'backfilled 2026-09-21; 5 Google avatars rewritten to =s600-c')
ON CONFLICT (migration) DO NOTHING;

-- This migration records itself, which is the convention every later one follows.
INSERT INTO public.migrations_applied (migration, note)
VALUES ('184_migrations_applied', 'the record table itself')
ON CONFLICT (migration) DO NOTHING;

-- ── Guards ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rows integer;
  v_anon boolean;
  v_auth boolean;
BEGIN
  SELECT count(*) INTO v_rows FROM public.migrations_applied;

  -- NON-VACUITY. An empty table satisfies every "nothing bad is recorded"
  -- assertion and says nothing whatever about what ran.
  IF v_rows < 6 THEN
    RAISE EXCEPTION
      '184 ABORTED: only % row(s) recorded, expected at least 6 (179-184). '
      'A record that recorded nothing is worse than none, because the drift '
      'detector would read it as "no migrations have ever run".', v_rows;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.migrations_applied
                  WHERE migration = '181_find_training_partners_exclude_instructors') THEN
    RAISE EXCEPTION
      '184 ABORTED: 181 is not recorded. It IS applied -- it returned '
      'instructors_now_excluded: 18 -- and its absence from a hand-kept record '
      'is the specific drift this table exists to end.';
  END IF;

  v_anon := has_table_privilege('anon', 'public.migrations_applied', 'INSERT')
         OR has_any_column_privilege('anon', 'public.migrations_applied', 'INSERT');
  v_auth := has_table_privilege('authenticated', 'public.migrations_applied', 'INSERT')
         OR has_any_column_privilege('authenticated', 'public.migrations_applied', 'INSERT');

  -- has_any_column_privilege as well as has_table_privilege: the table-level
  -- form answers a confident false when the grant is column-level, which is
  -- the lesson migration 175's rehearsal arm D7 produced.
  IF v_anon OR v_auth THEN
    RAISE EXCEPTION
      '184 ABORTED: a client role can INSERT here (anon=%, authenticated=%). '
      'Supabase grants new public objects to those roles DIRECTLY, so REVOKE '
      'FROM PUBLIC alone misses them. A record of what ran that its subjects '
      'can write is not a record.', v_anon, v_auth;
  END IF;

  RAISE NOTICE '184: migrations_applied created with % rows.', v_rows;
END $$;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT count(*) FROM public.migrations_applied)                       AS recorded,
  (SELECT string_agg(migration, ', ' ORDER BY migration)
     FROM public.migrations_applied)                                     AS migrations,
  (SELECT count(*) >= 6 FROM public.migrations_applied)                  AS backfill_present_ok,
  (NOT has_any_column_privilege('anon','public.migrations_applied','INSERT'))
                                                                         AS anon_cannot_write_ok,
  (NOT has_any_column_privilege('authenticated','public.migrations_applied','INSERT'))
                                                                         AS authenticated_cannot_write_ok;
