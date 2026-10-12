-- 216_t_auth3_google_avatar_backfill_REHEARSAL.sql
--
-- Rehearsal for supabase/migrations/216_t_auth3_google_avatar_backfill.sql.
-- Run in the Supabase SQL editor. Everything through the ROLLBACK is inside
-- BEGIN ... ROLLBACK; production is not modified.
--
-- The editor shows only the LAST result set, so run it in two pastes:
--   1. everything up to and including ROLLBACK  -> ONE result set, R1..R7
--   2. Part G, after the ROLLBACK               -> proves nothing escaped
--
-- Part 0  a snapshot of every avatar, and the target set, BEFORE the body runs.
-- Part A  the migration body INCLUDING ITS GUARDS, spliced verbatim
--         (BEGIN/COMMIT and the migrations_applied INSERT omitted).
-- Part B  what the body did, each verdict printed beside what it read.
-- Part G  nothing escaped -- OUTSIDE THE TRANSACTION.
--
-- Every row must read PASS. 7 of 7.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- PART 0: baseline, taken before the body runs
-- ══════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE reh216_before ON COMMIT DROP AS
  SELECT id, avatar_url FROM public.users;

CREATE TEMP TABLE reh216_targets ON COMMIT DROP AS
  SELECT u.id, coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture') AS provider_url
    FROM public.users u
    JOIN auth.users au ON au.id = u.id
   WHERE coalesce(btrim(u.avatar_url), '') = ''
     AND u.deleted_at IS NULL
     AND u.created_at >= '2026-07-10'
     AND au.raw_app_meta_data->>'provider' = 'google'
     AND coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture')
         ~ '^https://[a-z0-9.-]*googleusercontent\.com/';

-- ══════════════════════════════════════════════════════════════════════════
-- PART A: the migration body, spliced verbatim from
--         supabase/migrations/216_t_auth3_google_avatar_backfill.sql
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_before  integer;
  v_written integer;
  v_after   integer;
  v_small   integer;
BEGIN
  SELECT count(*) INTO v_before
    FROM public.users u
    JOIN auth.users au ON au.id = u.id
   WHERE coalesce(btrim(u.avatar_url), '') = ''
     AND u.deleted_at IS NULL
     AND u.created_at >= '2026-07-10'
     AND au.raw_app_meta_data->>'provider' = 'google'
     AND coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture')
         ~ '^https://[a-z0-9.-]*googleusercontent\.com/';

  IF v_before = 0 THEN
    IF EXISTS (SELECT 1 FROM public.migrations_applied
                WHERE migration = '216_t_auth3_google_avatar_backfill') THEN
      RAISE NOTICE '216: already applied and nothing left to backfill. No change.';
      RETURN;
    END IF;
    RAISE EXCEPTION
      '216 ABORTED: no Google account is missing its photo. Measured 2 on 2026-10-10. '
      'Either they were fixed some other way or this is the wrong database, and a '
      'backfill that matches nothing would report success having done nothing.';
  END IF;

  -- Not an equality check on 2. A Google sign-up between the measurement and the
  -- apply, before PR #202 deploys, is broken the same way and belongs in this set.
  -- What must not happen is a population far beyond what was measured.
  IF v_before > 10 THEN
    RAISE EXCEPTION
      '216 ABORTED: % accounts match, measured 2 on 2026-10-10. Re-measure before '
      'writing this many photos.', v_before;
  END IF;

  UPDATE public.users u
     SET avatar_url = CASE
           WHEN src.url ~ '=s\d+-c$' THEN regexp_replace(src.url, '=s\d+-c$', '=s600-c')
           ELSE src.url
         END
    FROM (SELECT au.id,
                 coalesce(au.raw_user_meta_data->>'avatar_url',
                          au.raw_user_meta_data->>'picture') AS url,
                 au.raw_app_meta_data->>'provider' AS provider
            FROM auth.users au) AS src
   WHERE src.id = u.id
     AND coalesce(btrim(u.avatar_url), '') = ''
     AND u.deleted_at IS NULL
     AND u.created_at >= '2026-07-10'
     AND src.provider = 'google'
     AND src.url ~ '^https://[a-z0-9.-]*googleusercontent\.com/';
  GET DIAGNOSTICS v_written = ROW_COUNT;

  IF v_written <> v_before THEN
    RAISE EXCEPTION '216 ABORTED: counted % to backfill, wrote %. Nothing kept.', v_before, v_written;
  END IF;

  SELECT count(*) INTO v_after
    FROM public.users u
    JOIN auth.users au ON au.id = u.id
   WHERE coalesce(btrim(u.avatar_url), '') = ''
     AND u.deleted_at IS NULL
     AND u.created_at >= '2026-07-10'
     AND au.raw_app_meta_data->>'provider' = 'google'
     AND coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture')
         ~ '^https://[a-z0-9.-]*googleusercontent\.com/';
  IF v_after <> 0 THEN
    RAISE EXCEPTION '216 ABORTED: % account(s) still blank after the write. Nothing kept.', v_after;
  END IF;

  -- 183's invariant must still hold: no Google avatar left at a small size.
  SELECT count(*) INTO v_small
    FROM public.users
   WHERE avatar_url LIKE '%googleusercontent.com%'
     AND avatar_url ~ '=s\d+-c$' AND avatar_url !~ '=s600-c$';
  IF v_small <> 0 THEN
    RAISE EXCEPTION '216 ABORTED: % Google avatar(s) carry a non-600 size suffix.', v_small;
  END IF;

  RAISE NOTICE '216: restored % Google photo(s).', v_written;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- PART B: what it did
-- ══════════════════════════════════════════════════════════════════════════
WITH
t AS (SELECT count(*) AS n FROM reh216_targets),
after AS (
  SELECT b.id, b.avatar_url AS was, u.avatar_url AS now, (tg.id IS NOT NULL) AS is_target, tg.provider_url
    FROM reh216_before b
    JOIN public.users u ON u.id = b.id
    LEFT JOIN reh216_targets tg ON tg.id = b.id
)
SELECT * FROM (VALUES
  (1, 'R1 targets found, within the guard''s bounds',
         CASE WHEN (SELECT n FROM t) BETWEEN 1 AND 10 THEN 'PASS' ELSE 'FAIL' END,
         'targets=' || (SELECT n FROM t) || ' (measured 2 on 2026-10-10); ids: ' ||
           coalesce((SELECT string_agg(left(id::text, 8), ', ' ORDER BY id) FROM reh216_targets), '(none)')),
  (2, 'R2 every target now has an avatar',
         CASE WHEN (SELECT n FROM t) > 0
                AND NOT EXISTS (SELECT 1 FROM after WHERE is_target AND coalesce(btrim(now), '') = '')
              THEN 'PASS' ELSE 'FAIL' END,
         coalesce((SELECT string_agg(left(id::text, 8) || ' -> ' || left(coalesce(now, '(null)'), 48) || '...'
                                     || right(coalesce(now, ''), 8), ' | ' ORDER BY id)
                     FROM after WHERE is_target), '(no targets)')),
  (3, 'R3 each written URL is the provider URL, resized by the providerAvatar rule',
         CASE WHEN (SELECT n FROM t) > 0 AND NOT EXISTS (
                SELECT 1 FROM after WHERE is_target AND now IS DISTINCT FROM
                  CASE WHEN provider_url ~ '=s\d+-c$' THEN regexp_replace(provider_url, '=s\d+-c$', '=s600-c')
                       ELSE provider_url END)
              THEN 'PASS' ELSE 'FAIL' END,
         'matching=' || (SELECT count(*) FROM after WHERE is_target AND now IS NOT DISTINCT FROM
                  CASE WHEN provider_url ~ '=s\d+-c$' THEN regexp_replace(provider_url, '=s\d+-c$', '=s600-c')
                       ELSE provider_url END) || ' of ' || (SELECT n FROM t)),
  (4, 'R4 no other account''s avatar changed',
         CASE WHEN (SELECT count(*) FROM after WHERE NOT is_target) > 50
                AND NOT EXISTS (SELECT 1 FROM after WHERE NOT is_target AND now IS DISTINCT FROM was)
              THEN 'PASS' ELSE 'FAIL' END,
         'compared ' || (SELECT count(*) FROM after WHERE NOT is_target) || ' other accounts, changed: ' ||
           (SELECT count(*) FROM after WHERE NOT is_target AND now IS DISTINCT FROM was)),
  (5, 'R5 the targets were blank before (the premise, measured)',
         CASE WHEN (SELECT n FROM t) > 0 AND NOT EXISTS (SELECT 1 FROM after WHERE is_target AND coalesce(btrim(was), '') <> '')
              THEN 'PASS' ELSE 'FAIL' END,
         'blank before: ' || (SELECT count(*) FROM after WHERE is_target AND coalesce(btrim(was), '') = '') || ' of ' || (SELECT n FROM t)),
  (6, 'R6 nothing left to backfill after the body',
         CASE WHEN (SELECT count(*) FROM public.users u JOIN auth.users au ON au.id = u.id
                     WHERE coalesce(btrim(u.avatar_url), '') = ''      AND u.deleted_at IS NULL      AND u.created_at >= '2026-07-10'      AND au.raw_app_meta_data->>'provider' = 'google'      AND coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture')          ~ '^https://[a-z0-9.-]*googleusercontent\.com/') = 0
              THEN 'PASS' ELSE 'FAIL' END,
         'remaining=' || (SELECT count(*) FROM public.users u JOIN auth.users au ON au.id = u.id
                     WHERE coalesce(btrim(u.avatar_url), '') = ''      AND u.deleted_at IS NULL      AND u.created_at >= '2026-07-10'      AND au.raw_app_meta_data->>'provider' = 'google'      AND coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture')          ~ '^https://[a-z0-9.-]*googleusercontent\.com/')),
  (7, 'R7 identity (who ran this)',
         CASE WHEN current_user IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
         'current_user=' || current_user || ', session_user=' || session_user ||
           ', 216 recorded already: ' || EXISTS (SELECT 1 FROM public.migrations_applied
                                                  WHERE migration = '216_t_auth3_google_avatar_backfill'))
) AS r(seq, arm, verdict, detail)
ORDER BY seq;

ROLLBACK;

-- ══════════════════════════════════════════════════════════════════════════
-- PART G: nothing escaped. Paste and run this ALONE, after the block above.
-- Expect blank_google_with_photo = 2 (unchanged) and recorded_216 = false.
-- ══════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM public.users u JOIN auth.users au ON au.id = u.id
    WHERE coalesce(btrim(u.avatar_url), '') = ''      AND u.deleted_at IS NULL      AND u.created_at >= '2026-07-10'      AND au.raw_app_meta_data->>'provider' = 'google'      AND coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture')          ~ '^https://[a-z0-9.-]*googleusercontent\.com/') AS blank_google_with_photo,
  EXISTS (SELECT 1 FROM public.migrations_applied
           WHERE migration = '216_t_auth3_google_avatar_backfill') AS recorded_216;
