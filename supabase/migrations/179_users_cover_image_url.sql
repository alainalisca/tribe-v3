-- 179_users_cover_image_url.sql
--
-- ONE cover image column. Adds public.users.cover_image_url and backfills it
-- from the two columns that currently disagree.
--
-- ADDITIVE ONLY. banner_url and storefront_banner_url are NOT dropped here.
-- That is a separate migration, after the read sites are confirmed gone.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY A NEW COLUMN AND NOT A RENAME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `ALTER TABLE ... RENAME COLUMN storefront_banner_url TO cover_image_url` is
-- cleaner in the database and breaks every running client the instant it
-- applies. Migrations here are hand-applied and the deploy is separate, so
-- there is a window where shipped code queries a column that no longer exists.
--
-- A rename makes the COLUMN switch atomic while the CODE switch cannot be, and
-- this column feeds three surfaces: the session feed hero fallback
-- (lib/sport-images.ts:62), the storefront hero, and the profile. A bad minute
-- is visible on every card in the app, not on one page.
--
-- Additive has no window. The old columns keep working, the new one is
-- populated, the code switches, the old ones drop later.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY TWO COLUMNS EXISTED, AND WHY THE NAME CHANGES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Four write sites across two columns, and only one wrote both:
--
--   onboarding/instructor/page.tsx:433   BOTH (an explicit BUG-007 dual-write)
--   profile/useProfile.ts:190            banner_url only
--   profile/edit/page.tsx                storefront_banner_url only
--   StorefrontEditor.tsx:177             storefront_banner_url only
--
-- So an instructor who onboarded and then changed their banner from anywhere
-- else left the two columns disagreeing, in whichever direction their second
-- upload happened to take.
--
-- THE NAME IS PART OF THE CAUSE. `storefront_banner_url` describes one of the
-- three consumers. Someone needing a banner that was not a storefront banner
-- added a second column rather than renaming the first -- which is exactly the
-- shape of the problem this migration ends. `cover_image_url` says what it is
-- for all three.
--
-- ALEXANDRA IS THE PROOF THAT THE NAME LIES. Both of her banners sit on the
-- LEGACY profile-images storage path, including the one in
-- storefront_banner_url. So the column name does not even imply which storage
-- location, let alone which flow, wrote the value. A column name cannot be
-- trusted as a proxy for provenance, and reading it as one is how the wrong
-- survivor nearly got picked.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE BACKFILL RULE: PRESENCE FIRST, THEN THE FIVE BY NAME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Measured on production 2026-09-20:
--
--   only_legacy         13   banner_url set, storefront_banner_url NULL
--   only_new             3   storefront_banner_url set, banner_url NULL
--   both_and_different   5   both set and not equal
--
-- THE THIRTEEN ARE A LIVE DEFECT, NOT DRIFT. Thirteen instructors uploaded a
-- banner from /profile, which writes banner_url, and the storefront reads
-- storefront_banner_url -- so their storefront has shown no banner since.
-- Nobody reported it because the person who uploaded it sees it correctly on
-- their own profile. Only visitors see the blank one.
--
-- A FIXED SURVIVING COLUMN WOULD BE WRONG EITHER WAY. Taking
-- storefront_banner_url blanks those thirteen. Taking banner_url blanks the
-- three. So the rule is per row: coalesce on PRESENCE, and where both are
-- present and differ, decide by RECENCY -- which split 3 to 2 across the five,
-- so neither column wins globally there either.
--
-- THE FIVE ARE WRITTEN OUT, NOT DERIVED. Each upload URL carries its epoch,
-- and it would be possible to parse and compare them in SQL. That is not done
-- here on purpose: a migration that computes a judgement is a migration whose
-- judgement nobody can review, and one malformed URL turns a data decision
-- into a silent one. They are an explicit VALUES list with the reasoning
-- beside each, and the guard asserts each row still holds BOTH of the values
-- measured today -- so if any instructor re-uploads before this is applied,
-- the migration aborts rather than applying a stale decision.
--
-- Per-row reasoning (recency; epoch is from the upload filename):
--   Caroline       legacy 1782918797835 > storefront 1782227634967  -> legacy
--   Jonathan       legacy 1782084951804 < storefront 1782085457928  -> storefront
--   Juan Bernardo  legacy 1781836997393 > storefront 1781834232747  -> legacy
--   Alexandra      legacy 1779469382381 < storefront 1779744732006  -> storefront
--                  (both on the legacy storage path; see the note above)
--   Darian         storefront is the stable-path form from the 2026-08-23 work,
--                  media/storefront-banners/<uid>/banner?v=1787489844555, and
--                  that cache-buster postdates his legacy 1781962600989
--                  -> storefront. The only one not settled by comparing two
--                  upload epochs directly.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cover_image_url text;

-- ── Grant, decided rather than defaulted ────────────────────────────────────
-- Migration 067 revoked table-level SELECT on public.users and re-granted a
-- fixed column list, so a NEW column is unreadable until it is named. Without
-- the line below every surface reading cover_image_url would return null and
-- the banner would silently vanish everywhere -- the same failure the two
-- columns already cause, arriving by a different route.
--
-- verify-migration-state.test.ts enforces this and caught it: the first draft
-- of 179 added the column with no grant at all.
--
-- ANON IS DELIBERATELY NOT GRANTED, on the evidence rather than by default.
-- No anon-reachable surface reads a banner today:
--   * /storefront and /profile are NOT in middleware's publicPaths, so both
--     require a session.
--   * /i/[id] IS public, and selects avatar_url, bio, instructor_bio, sports
--     and average_rating -- no banner column.
--   * users_discoverable, the anon-facing view (114), does not expose either
--     banner column.
-- If a public page ever needs the cover image, add the anon grant in its own
-- migration with that page named, rather than widening this one speculatively.
GRANT SELECT (cover_image_url) ON public.users TO authenticated;

-- Deliberately NOT:
--   GRANT SELECT (cover_image_url) ON public.users TO anon;

-- ── The five, decided by hand ───────────────────────────────────────────────
-- Filled from the production list. Each row is (user_id, chosen_url,
-- expected_legacy, expected_storefront). The last two are what was MEASURED on
-- 2026-09-20 and exist so the guard can refuse a stale decision.
CREATE TEMP TABLE cover_decisions (
  user_id              uuid PRIMARY KEY,
  who                  text NOT NULL,
  chosen_url           text NOT NULL,
  expected_legacy      text NOT NULL,
  expected_storefront  text NOT NULL
) ON COMMIT DROP;

-- >>> THE FIVE ROWS GO HERE, AND THIS MIGRATION DOES NOT RUN WITHOUT THEM.
-- >>>
-- >>> Uncomment the INSERT and paste the rows produced by the generator query
-- >>> in supabase/captures/capture_cover_conflicts.sql. That query emits these
-- >>> lines verbatim, including the UUIDs and the full URLs, so nothing here is
-- >>> transcribed by hand.
-- >>>
-- >>> Left COMMENTED rather than empty on purpose: an `INSERT ... VALUES ;`
-- >>> with no rows is a syntax error, so the file would not parse and would
-- >>> never reach the guard below that explains what is missing. A migration
-- >>> that fails with "syntax error at or near" teaches nobody anything.
-- >>>
-- >>> As it stands the file parses, runs, and aborts at the guard with the
-- >>> reason. Nothing is written before that point.
--
-- INSERT INTO cover_decisions (user_id, who, chosen_url, expected_legacy, expected_storefront) VALUES
--   ('<uuid>', 'Caroline',      '<legacy url>',     '<legacy url>', '<storefront url>'),
--   ('<uuid>', 'Jonathan',      '<storefront url>', '<legacy url>', '<storefront url>'),
--   ('<uuid>', 'Juan Bernardo', '<legacy url>',     '<legacy url>', '<storefront url>'),
--   ('<uuid>', 'Alexandra',     '<storefront url>', '<legacy url>', '<storefront url>'),
--   ('<uuid>', 'Darian',        '<storefront url>', '<legacy url>', '<storefront url>');

-- ── Guard: the measured state still holds ───────────────────────────────────
-- Same shape as 169, 171 and 178. Every count is asserted before anything is
-- written, and a difference aborts rather than proceeding on a stale measure.
DO $$
DECLARE
  v_only_legacy integer;
  v_only_new    integer;
  v_conflict    integer;
  v_decisions   integer;
  v_stale       text;
BEGIN
  SELECT count(*) INTO v_decisions FROM cover_decisions;
  IF v_decisions <> 5 THEN
    RAISE EXCEPTION
      '179 ABORTED: cover_decisions holds % rows, expected 5. The five conflicting '
      'instructors must be pasted into this migration before it runs. An empty list '
      'would silently leave every conflicting row unresolved.', v_decisions;
  END IF;

  SELECT count(*) FILTER (WHERE banner_url IS NOT NULL AND storefront_banner_url IS NULL),
         count(*) FILTER (WHERE banner_url IS NULL AND storefront_banner_url IS NOT NULL),
         count(*) FILTER (WHERE banner_url IS NOT NULL AND storefront_banner_url IS NOT NULL
                            AND banner_url IS DISTINCT FROM storefront_banner_url)
    INTO v_only_legacy, v_only_new, v_conflict
    FROM public.users;

  IF v_only_legacy <> 13 OR v_only_new <> 3 OR v_conflict <> 5 THEN
    RAISE EXCEPTION
      '179 ABORTED: measured 2026-09-20 as 13 legacy-only, 3 new-only, 5 conflicting; '
      'found %, %, %. Someone uploaded a banner since. Re-measure and re-decide the '
      'conflicts before applying -- do NOT widen the backfill to cover the difference.',
      v_only_legacy, v_only_new, v_conflict;
  END IF;

  -- Each of the five must still hold BOTH values measured today. A re-upload
  -- between the measurement and the apply makes that row's decision stale, and
  -- a stale decision is how the wrong image ends up on every session card that
  -- instructor hosts.
  SELECT string_agg(d.who, ', ') INTO v_stale
    FROM cover_decisions d
    JOIN public.users u ON u.id = d.user_id
   WHERE u.banner_url IS DISTINCT FROM d.expected_legacy
      OR u.storefront_banner_url IS DISTINCT FROM d.expected_storefront;

  IF v_stale IS NOT NULL THEN
    RAISE EXCEPTION
      '179 ABORTED: these instructors no longer hold the values the decision was made '
      'against: %. Re-read their two columns and re-decide.', v_stale;
  END IF;

  IF EXISTS (SELECT 1 FROM cover_decisions d LEFT JOIN public.users u ON u.id = d.user_id
              WHERE u.id IS NULL) THEN
    RAISE EXCEPTION '179 ABORTED: a decision names a user id that does not exist.';
  END IF;
END $$;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Presence first. coalesce takes whichever is non-null, which resolves the 13
-- and the 3 with no judgement required. Rows where both are NULL stay NULL.
UPDATE public.users
   SET cover_image_url = coalesce(banner_url, storefront_banner_url)
 WHERE cover_image_url IS NULL
   AND (banner_url IS NOT NULL OR storefront_banner_url IS NOT NULL);

-- Then the five, by hand, overwriting whatever coalesce chose for them.
UPDATE public.users u
   SET cover_image_url = d.chosen_url
  FROM cover_decisions d
 WHERE u.id = d.user_id;

-- ── Post-conditions ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing integer;
  v_wrong   integer;
BEGIN
  -- Nobody who had a banner lost one.
  SELECT count(*) INTO v_missing FROM public.users
   WHERE (banner_url IS NOT NULL OR storefront_banner_url IS NOT NULL)
     AND cover_image_url IS NULL;
  IF v_missing <> 0 THEN
    RAISE EXCEPTION '179 ABORTED: % user(s) had a banner and have no cover_image_url.', v_missing;
  END IF;

  -- The five got their decided value, not coalesce's.
  SELECT count(*) INTO v_wrong FROM cover_decisions d
    JOIN public.users u ON u.id = d.user_id
   WHERE u.cover_image_url IS DISTINCT FROM d.chosen_url;
  IF v_wrong <> 0 THEN
    RAISE EXCEPTION '179 ABORTED: % of the five did not receive the decided URL.', v_wrong;
  END IF;

  RAISE NOTICE '179: cover_image_url added and backfilled. Old columns left in place.';
END $$;

-- ── Verification. Every *_ok must read true. ────────────────────────────────
SELECT
  (SELECT count(*) FROM public.users WHERE cover_image_url IS NOT NULL)            AS with_cover,
  (SELECT count(*) FROM public.users
    WHERE banner_url IS NOT NULL OR storefront_banner_url IS NOT NULL)             AS had_a_banner,
  (SELECT count(*) FROM public.users
    WHERE banner_url IS NOT NULL AND storefront_banner_url IS NULL)                AS still_only_legacy,
  coalesce((SELECT count(*) = 0 FROM public.users
    WHERE (banner_url IS NOT NULL OR storefront_banner_url IS NOT NULL)
      AND cover_image_url IS NULL), false)                                          AS nobody_lost_a_banner_ok,
  coalesce((SELECT count(*) > 0 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='cover_image_url'), false) AS column_exists_ok,
  coalesce((SELECT count(*) = 2 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
      AND column_name IN ('banner_url','storefront_banner_url')), false)            AS old_columns_still_present_ok;
