-- 171_backfill_instructor_sports.sql
--
-- Issue 1 (Ronald Gallego's onboarding), data half. Gives three instructor
-- accounts a canonical `users.sports` array derived from what they had already
-- typed into `users.specialties`.
--
-- WHY
-- Instructor onboarding has never written users.sports. Its chips wrote into
-- users.specialties, which is free text, and /instructors filtered its sport
-- chips against that same free text -- so a chip only matched when an
-- instructor happened to spell the sport exactly the way the chip did.
-- Commit e592ddc moved the filter onto users.sports, the canonical vocabulary
-- in lib/sports.ts. This file backfills the accounts that had a mappable
-- specialty but no sports array, so the read fix reaches them.
--
-- THIS MIGRATION ONLY WRITES `sports`. It never modifies `specialties`. The
-- free text stays exactly as the instructor wrote it, because after Issue 1
-- specialties is the field that carries what makes an instructor different
-- (sound healing, women's circles, "fitness & funcional") and is still shown
-- and searched. Nothing here is destructive; the additive/destructive split
-- does not apply because there is no destructive half.
--
-- MEASURED ON PRODUCTION 2026-09-17, immediately before writing this:
--   discoverable instructors (users_discoverable rules) ................... 15
--   ... reachable by SOME sport chip BEFORE commit e592ddc ................. 4
--   ... reachable by SOME sport chip AFTER commit e592ddc ................. 11
--   ... reachable AFTER this migration also runs .......................... 12
--   instructor rows (any flag) with an empty or NULL sports array ......... 21
--
-- SCOPE: THREE EXPLICIT IDS, NOT A RULE.
-- A rule-shaped predicate ("every instructor with empty sports and non-empty
-- specialties") would catch SEVEN rows, not three. The extra four are a
-- deleted account whose only specialty is the string 'jrar1', two more deleted
-- accounts, and rows whose free text does not map to any canonical sport.
-- None of them was measured, so none of them is touched. The ids are listed
-- literally so a guard failure can be diffed against what was measured rather
-- than re-derived.
--
-- THREE OF THE FOUR ACCOUNTS IN THE SPEC ARE TEST ACCOUNTS.
-- `users_discoverable` excludes is_test_account, so backfilling BullBox and
-- Dennis changes nothing any user can see. They are included because they were
-- named in the spec and because leaving them half-migrated makes the next
-- person re-derive this decision. The one row with a visible effect is
-- Salomon's. This is stated here rather than implied by the count of three.
--
-- THE FOUR ACCOUNTS, verbatim as read from production 2026-09-17:
--
--   307cf7fa-a12e-468d-83f5-1a1cb82226e7  Salomon Tabares Adarve   LIVE
--     sports       {}  (empty array)
--     specialties  {"Boxeo","Muay Thai & kickboxing",
--                   "fitness & funcional - Entrenamiento deportivo & Recreativo."}
--     -> sports    {Boxing,"Muay Thai",Kickboxing}
--     Boxeo is Boxing. The second entry names two sports in one free-text
--     string, which is exactly why free text cannot be filtered on. The third
--     maps to nothing canonical and stays in specialties, where it belongs.
--
--   7c4e29a2-7689-4e83-8787-113ebd2c6a42  BullBox                  TEST ACCOUNT
--     sports       NULL  (not an empty array -- the guard must accept both)
--     specialties  {CrossFit,HYROX}
--     -> sports    {CrossFit,HYROX}
--     There are TWO users rows named BullBox. The other,
--     b4e40404-7dd5-4f38-9f22-deb4601419a3, has is_instructor = false and no
--     specialties, and is NOT a target. The id below is the instructor row.
--
--   804f2c28-9851-4f7f-95ce-4bf5ce85caca  Dennis                   TEST ACCOUNT
--     sports       {}  (empty array)
--     specialties  {Boxing,Dior}
--     -> sports    {Boxing}
--     'Dior' is not a sport and gains no sports value. It is left in
--     specialties untouched: removing it is a separate judgement about someone
--     else's free text, and this migration does not make those.
--
--   673834b4-d9be-4782-86c9-ff27376233a7  Walter White             TEST ACCOUNT
--     sports       {}  (empty array)
--     specialties  {Meditation}
--     -> NOT UPDATED. Meditation has no canonical sport. He keeps his
--     specialty and gains no sports value. He appears in this file only as the
--     control: the verification SELECT asserts his sports array is still empty
--     afterwards, so a predicate that had quietly widened would be caught.
--
-- THE GUARD, AND WHY IT ACCEPTS 0 AS WELL AS 3
--   3 -> production as measured. Back them fill.
--   0 -> already applied, or a database rebuilt from these migrations where
--        these accounts never existed. No-op, so reruns and from-scratch
--        rebuilds both succeed.
--   any other value -> a row changed between the measurement and the apply.
--        That is exactly the case that must not be swept along with the known
--        three, so it raises and rolls back.
--
-- The specialties are asserted too, not just the count. If an instructor edited
-- their free text since the measurement, the mapping above may no longer be the
-- right one, and a count that still reads 3 would hide that. Checking the count
-- alone would be a guard that passes for the wrong reason.
--
-- The guard and the UPDATEs live in ONE DO block on purpose. A DO block is a
-- single statement, so RAISE rolls the whole thing back and no partial write
-- can survive a failed guard -- true whether or not the surrounding session is
-- in an explicit transaction, which matters because this is run by hand in the
-- Supabase SQL editor.
--
-- TRIGGERS: public.users carries exactly one trigger, users_banned_guard
-- (migration 098, BEFORE UPDATE). Its body is a no-op unless NEW.banned IS
-- DISTINCT FROM OLD.banned, and this migration never writes banned, so nothing
-- cascades and nothing escapes a ROLLBACK.
--
-- Per feedback-do-block-no-visible-output: the Supabase SQL editor shows only
-- "success, no rows returned" for a bare DO block and discards RAISE NOTICE, so
-- the file ends with a verification SELECT that returns the post-state as rows.

DO $$
DECLARE
  v_expected constant integer := 3;
  v_found    integer;
  v_drifted  integer;
  v_updated  integer;

  k_salomon  constant uuid := '307cf7fa-a12e-468d-83f5-1a1cb82226e7';
  k_bullbox  constant uuid := '7c4e29a2-7689-4e83-8787-113ebd2c6a42';
  k_dennis   constant uuid := '804f2c28-9851-4f7f-95ce-4bf5ce85caca';
BEGIN
  -- How many targets still need the backfill? coalesce(array_length(...),0)
  -- because BullBox's column is NULL while the other two are empty arrays, and
  -- `sports = '{}'` is NULL (not false) against a NULL column.
  SELECT count(*) INTO v_found
  FROM public.users u
  WHERE u.id IN (k_salomon, k_bullbox, k_dennis)
    AND coalesce(array_length(u.sports, 1), 0) = 0;

  IF v_found = 0 THEN
    RAISE NOTICE '171: all three targets already have a sports array -- already applied, or a fresh rebuild. Nothing to do.';
    RETURN;
  END IF;

  IF v_found <> v_expected THEN
    RAISE EXCEPTION
      '171 ABORTED: expected % instructor rows still needing a sports backfill (measured on production 2026-09-17) but found %. '
      'A row was changed since the measurement. Re-measure and re-scope this migration before applying it; do NOT widen the guard.',
      v_expected, v_found;
  END IF;

  -- The free text must still be what the mapping above was derived from.
  SELECT count(*) INTO v_drifted
  FROM public.users u
  WHERE (u.id = k_salomon AND u.specialties IS DISTINCT FROM
          ARRAY['Boxeo','Muay Thai & kickboxing','fitness & funcional - Entrenamiento deportivo & Recreativo.']::text[])
     OR (u.id = k_bullbox AND u.specialties IS DISTINCT FROM ARRAY['CrossFit','HYROX']::text[])
     OR (u.id = k_dennis  AND u.specialties IS DISTINCT FROM ARRAY['Boxing','Dior']::text[]);

  IF v_drifted <> 0 THEN
    RAISE EXCEPTION
      '171 ABORTED: % of the 3 targets has specialties that differ from what was measured on 2026-09-17. '
      'The sports mapping in this file was derived from that free text, so it can no longer be assumed correct. '
      'Re-read the rows and re-derive the mapping.', v_drifted;
  END IF;

  UPDATE public.users
     SET sports = ARRAY['Boxing','Muay Thai','Kickboxing']::text[]
   WHERE id = k_salomon;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION '171 ABORTED: expected to update 1 row for Salomon but updated %.', v_updated;
  END IF;

  UPDATE public.users
     SET sports = ARRAY['CrossFit','HYROX']::text[]
   WHERE id = k_bullbox;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION '171 ABORTED: expected to update 1 row for BullBox but updated %.', v_updated;
  END IF;

  UPDATE public.users
     SET sports = ARRAY['Boxing']::text[]
   WHERE id = k_dennis;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION '171 ABORTED: expected to update 1 row for Dennis but updated %.', v_updated;
  END IF;

  RAISE NOTICE '171: backfilled users.sports on 3 instructor accounts. specialties untouched on all of them.';
END $$;

-- ---------------------------------------------------------------------------
-- Verification. The DO block above prints nothing the SQL editor will show, so
-- read the result of this instead. Expected, all four rows:
--
--   Salomon ... sports {Boxing,"Muay Thai",Kickboxing}   specialties unchanged (3)
--   BullBox ... sports {CrossFit,HYROX}                  specialties unchanged (2)
--   Dennis  ... sports {Boxing}                          specialties unchanged (2), still holds 'Dior'
--   Walter  ... sports {} or NULL                        specialties unchanged (1)  <- the control
--
-- Every sports_ok and specialties_ok column must read true. Walter White's
-- sports_ok reads true only while his array is still empty: if it is populated,
-- the predicate widened and caught a row that was never measured.
-- ---------------------------------------------------------------------------
SELECT
  u.name,
  u.is_test_account,
  u.sports,
  u.specialties,
  coalesce(array_length(u.sports, 1), 0)       AS sports_count,
  coalesce(array_length(u.specialties, 1), 0)  AS specialties_count,
  -- Every comparison is COALESCEd to false. A NULL sports column (BullBox's is
  -- NULL, not an empty array) makes `u.sports = ARRAY[...]` evaluate to NULL,
  -- which renders as a blank cell and conflates "the check could not report"
  -- with "the check reported a wrong value".
  coalesce(CASE u.id
    WHEN '307cf7fa-a12e-468d-83f5-1a1cb82226e7'::uuid
      THEN u.sports = ARRAY['Boxing','Muay Thai','Kickboxing']::text[]
    WHEN '7c4e29a2-7689-4e83-8787-113ebd2c6a42'::uuid
      THEN u.sports = ARRAY['CrossFit','HYROX']::text[]
    WHEN '804f2c28-9851-4f7f-95ce-4bf5ce85caca'::uuid
      THEN u.sports = ARRAY['Boxing']::text[]
    WHEN '673834b4-d9be-4782-86c9-ff27376233a7'::uuid
      THEN coalesce(array_length(u.sports, 1), 0) = 0   -- the control: still empty
  END, false) AS sports_ok,
  coalesce(CASE u.id
    WHEN '307cf7fa-a12e-468d-83f5-1a1cb82226e7'::uuid
      THEN u.specialties = ARRAY['Boxeo','Muay Thai & kickboxing','fitness & funcional - Entrenamiento deportivo & Recreativo.']::text[]
    WHEN '7c4e29a2-7689-4e83-8787-113ebd2c6a42'::uuid
      THEN u.specialties = ARRAY['CrossFit','HYROX']::text[]
    WHEN '804f2c28-9851-4f7f-95ce-4bf5ce85caca'::uuid
      THEN u.specialties = ARRAY['Boxing','Dior']::text[]
    WHEN '673834b4-d9be-4782-86c9-ff27376233a7'::uuid
      THEN u.specialties = ARRAY['Meditation']::text[]
  END, false) AS specialties_ok
FROM public.users u
WHERE u.id IN (
  '307cf7fa-a12e-468d-83f5-1a1cb82226e7'::uuid,   -- Salomon Tabares Adarve  LIVE
  '7c4e29a2-7689-4e83-8787-113ebd2c6a42'::uuid,   -- BullBox                 TEST
  '804f2c28-9851-4f7f-95ce-4bf5ce85caca'::uuid,   -- Dennis                  TEST
  '673834b4-d9be-4782-86c9-ff27376233a7'::uuid    -- Walter White  TEST, the control
)
ORDER BY u.is_test_account, u.name;
