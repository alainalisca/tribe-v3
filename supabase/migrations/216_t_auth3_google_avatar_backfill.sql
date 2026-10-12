-- 216_t_auth3_google_avatar_backfill.sql
--
-- T-AUTH3, part 2. Give back the Google photos that the broken sign-in upsert
-- never saved.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT HAPPENED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- lib/auth-helpers.ts sent one upsert carrying `email` on every sign-in.
-- ON CONFLICT DO UPDATE SET email = EXCLUDED.email needs SELECT on users.email,
-- which migration 118 (T-SEC5, July 2026) revoked from `authenticated`. Every
-- sign-in since failed 42501 as a whole, so a new Google account never got the
-- photo Google supplied. PR #202 fixes the code; this restores the rows it
-- already cost.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- MEASURED 2026-10-10, READ-ONLY, ON PRODUCTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The measuring query, with NO filter on provider, date, test or deleted, so
-- that nothing was left out by a predicate:
--
--   SELECT u.id, ... FROM public.users u JOIN auth.users au ON au.id = u.id
--    WHERE coalesce(btrim(u.avatar_url), '') = ''
--      AND coalesce(au.raw_user_meta_data->>'avatar_url',
--                   au.raw_user_meta_data->>'picture') IS NOT NULL;
--
-- returned exactly TWO rows, both provider google, both created 2026-10-02,
-- both is_test_account false, both not deleted, both with an
-- https://lh3.googleusercontent.com/a/... photo:
--
--   f6b5fd4a-e947-4895-b3c7-b199da81392f
--   50644bc5-7da0-4279-ba12-34c28529890b
--
-- This file's predicate is that query's predicate plus four narrowing filters
-- (google, https googleusercontent, created on or after 118's merge date, not
-- deleted). It does not depend on those ids, so a third account broken the same
-- way before the code fix deploys is repaired too; the guard bounds how many.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY "CREATED ON OR AFTER 2026-07-10"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- An older account with a blank avatar and a Google photo in its metadata could
-- be someone who REMOVED their photo on purpose. Before 118 the upsert worked,
-- so such an account got its photo at sign-up and blanking it later was a
-- choice. Measured: zero such accounts exist today, so the filter excludes
-- nobody now. It is there so the rule says what it means.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE URL RULE IS lib/providerAvatar.ts, TRANSCRIBED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Same as migration 183: a googleusercontent URL ending =s<digits>-c becomes
-- =s600-c; any other shape is stored as Google gave it. Both rows measured
-- above are /a/ACg8oc... URLs, which Google serves with =s96-c.

BEGIN;

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

-- ── Record this migration as applied ────────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('216_t_auth3_google_avatar_backfill',
        'T-AUTH3: restore Google photos lost to the 42501 sign-in upsert (2 measured 2026-10-10)')
ON CONFLICT (migration) DO NOTHING;

COMMIT;
