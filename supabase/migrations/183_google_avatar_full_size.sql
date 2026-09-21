-- 183_google_avatar_full_size.sql
--
-- Google OAuth avatars are stored at 96x96. Rewrite them to 600x600.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- MEASURED, NOT ASSUMED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- lib/auth-helpers.ts captures `user_metadata.avatar_url || .picture` and
-- writes it VERBATIM. Nothing downloads or resizes it. Google's conventional
-- value ends `=s96-c`, and a 128px circle on a 3x phone needs ~384px, so that
-- photo is upscaled fourfold.
--
-- The rewrite was verified against a REAL stored URL before this was written,
-- because "Google probably honours the size parameter" is not a fact:
--
--   ...=s96-c   -> HTTP 200,  3,165 bytes,  96 x 96
--   ...=s600-c  -> HTTP 200, 45,551 bytes, 600 x 600
--
-- Same URL, one substitution, no download and no re-hosting. 600 matches what
-- the uploader produces for a self-uploaded headshot (useEditProfile
-- compresses to max 600px), so both sources end up equivalent.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE SIZE OF THIS, WHICH IS SMALLER THAN IT FIRST LOOKED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Measured 2026-09-21 across live, non-deleted, non-banned, non-test accounts:
--
--   uploaded (supabase storage, already 600px)   37
--   none at all                                  36
--   google oauth (this migration's subject)       5
--
-- So this repairs FIVE accounts. It was first proposed as the blocking fix for
-- "profile photos look bad", on the assumption that provider avatars were the
-- common case; the query says otherwise. The larger causes are that the
-- other-user profile rendered a 600px photo into a 96px circle, and that
-- nearly half of all accounts have no photo at all -- neither of which this
-- migration touches.
--
-- Recorded because the reasoning was nearly acted on before it was checked.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SCOPE IS DELIBERATELY NARROW
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Only googleusercontent URLs ending in `=s<digits>-c` are touched. A Google
-- URL with no size suffix is LEFT ALONE rather than guessed at: appending a
-- parameter to an unknown URL shape is how a working avatar becomes a 404.
-- lib/providerAvatar.ts applies the identical rule at capture time, so new
-- sign-ups never store the small version and this migration never needs a
-- sequel.

-- ── Guard: the measured state still holds ──────────────────────────────────
DO $$
DECLARE
  v_google    integer;
  v_rewritable integer;
BEGIN
  SELECT count(*) FILTER (WHERE avatar_url LIKE '%googleusercontent.com%'),
         count(*) FILTER (WHERE avatar_url LIKE '%googleusercontent.com%'
                            AND avatar_url ~ '=s\d+-c$')
    INTO v_google, v_rewritable
    FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE;

  IF v_google = 0 THEN
    RAISE EXCEPTION
      '183 ABORTED: no Google avatars found at all. Measured 5 on 2026-09-21. '
      'Either the population moved or this is the wrong database -- and a '
      'rewrite that matches nothing would report success having done nothing.';
  END IF;

  -- Not an equality check on 5. A new Google sign-up between the measurement
  -- and the apply is EXPECTED and harmless: the rewrite is idempotent and
  -- per-row. What must not happen is matching nothing, which is asserted above.
  RAISE NOTICE '183: % Google avatars, % of them rewritable.', v_google, v_rewritable;
END $$;

-- ── The rewrite ────────────────────────────────────────────────────────────
-- Anchored at the END of the string, so a URL containing `=s96-c` in some
-- other position is untouched. Idempotent: applying it to `=s600-c` yields
-- `=s600-c`.
UPDATE public.users
   SET avatar_url = regexp_replace(avatar_url, '=s\d+-c$', '=s600-c')
 WHERE avatar_url LIKE '%googleusercontent.com%'
   AND avatar_url ~ '=s\d+-c$'
   AND avatar_url !~ '=s600-c$';

-- ── Post-conditions ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_small integer;
  v_large integer;
BEGIN
  SELECT count(*) FILTER (WHERE avatar_url ~ '=s\d+-c$' AND avatar_url !~ '=s600-c$'),
         count(*) FILTER (WHERE avatar_url ~ '=s600-c$')
    INTO v_small, v_large
    FROM public.users
   WHERE avatar_url LIKE '%googleusercontent.com%'
     AND deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE;

  IF v_small <> 0 THEN
    RAISE EXCEPTION '183 ABORTED: % Google avatar(s) still carry a non-600 size suffix.', v_small;
  END IF;

  IF v_large = 0 THEN
    RAISE EXCEPTION
      '183 ABORTED: no avatar ended up at =s600-c. The rewrite matched nothing, '
      'which is the failure mode that otherwise reports success.';
  END IF;

  RAISE NOTICE '183: % Google avatars now at =s600-c.', v_large;
END $$;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT count(*) FROM public.users
    WHERE avatar_url LIKE '%googleusercontent.com%'
      AND deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE)
                                                                        AS google_avatars,
  (SELECT count(*) FROM public.users
    WHERE avatar_url ~ '=s600-c$'
      AND deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE)
                                                                        AS now_at_600,
  coalesce((SELECT count(*) = 0 FROM public.users
    WHERE avatar_url LIKE '%googleusercontent.com%'
      AND avatar_url ~ '=s\d+-c$' AND avatar_url !~ '=s600-c$'
      AND deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE), false)
                                                                        AS no_small_avatars_left_ok,
  (SELECT min(avatar_url) FROM public.users
    WHERE avatar_url ~ '=s600-c$'
      AND deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE)
                                                                        AS example;
