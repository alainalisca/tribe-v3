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
--   only_legacy         14   banner_url set, storefront_banner_url NULL
--                            (13 live instructors + 1 soft-deleted account)
--   only_new             3   storefront_banner_url set, banner_url NULL
--   both_and_different   5   both set and not equal
--
-- THE 13 AND THE 14 ARE THE SAME DATA COUNTED TWO WAYS. NOTHING CHANGED.
-- The 13 came from the measuring query that chose the five, which filtered
-- `deleted_at IS NULL`. The guard below has no such filter and counts 14. The
-- fourteenth row is the `tribe` account, soft-deleted 2026-05-21. No banner
-- was uploaded, no row moved between buckets, no instructor is affected.
--
-- A FIRST DRAFT OF THIS HEADER SAID AN INSTRUCTOR UPLOADED A BANNER BETWEEN
-- THE CAPTURE AND THE REHEARSAL. That event did not happen. The correction is
-- recorded rather than quietly removed because a header asserting a false
-- event is worse than one saying nothing: the next reader would go looking
-- for an upload, fail to find it, and be left with a guard that fired for a
-- reason nobody wrote down.
--
-- HOW IT WAS MIS-DIAGNOSED, because the same trap is one query away. When the
-- rehearsal reported 14 against this header's 13, the two instruments compared
-- were the migration's guard and the rehearsal's arms. Those match exactly --
-- same relation, byte-identical predicate, no filter in either -- so the
-- conclusion drawn was that the data must have moved. THE PAIR THAT ACTUALLY
-- DISAGREED WAS THE GUARD AND THE MEASURING QUERY. That query was treated as
-- ground truth because it was an input rather than an output, and it was the
-- one instrument in the chain that nobody could read: it was typed once and
-- never committed, while the guard, the rehearsal and the capture are all in
-- this repository and all unfiltered.
--
-- DELETED ACCOUNTS ARE INCLUDED IN THE BACKFILL, DELIBERATELY. Stating it,
-- because otherwise it is not a decision, only the residue of which query
-- nobody filtered:
--
--   * Every other instrument here reads public.users unfiltered -- this
--     guard, the backfill, the post-conditions, capture_cover_conflicts.sql,
--     and the verifier probe GUARD_179_cover_image_backfilled. That probe
--     fails while ANY row holds a banner and no cover, so excluding deleted
--     rows from the backfill alone would leave it MISSING permanently.
--   * The cost is one soft-deleted row carrying a cover_image_url that no
--     surface renders. If that account is ever restored, it is already right.
--   * One population, stated once, used everywhere. A filter present in one
--     place and absent in another is precisely what produced the confusion
--     above, and adding a filter here would reintroduce it facing the other
--     way.
--
-- If a later migration needs deleted rows excluded, it excludes them in the
-- guard, the backfill and the probe together, or not at all.
--
-- IT IS UPDATED TO THE MEASURED NUMBER, NOT WIDENED TO A RANGE. Accepting a
-- band would make this guard permanently unable to notice the next one, which
-- is the only thing it does. A guard that accepts a range has been switched
-- off politely, and it still reads as a guard in review.
--
-- THE FIVE ARE UNAFFECTED BY THIS EDIT, which is what makes it safe to make
-- from the counts alone. only_new and both_and_different are unchanged at 3
-- and 5, so nobody left the conflicting bucket; and the per-row staleness
-- check below asserts that each of the five still holds BOTH values measured
-- for it, independently of every count. Raising 13 to 14 cannot weaken it.
--
-- THIRTEEN LIVE INSTRUCTORS ARE A LIVE DEFECT, NOT DRIFT. Thirteen uploaded a
-- banner from /profile, which writes banner_url, and the storefront reads
-- storefront_banner_url -- so their storefront has shown no banner since.
-- Nobody reported it because the person who uploaded it sees it correctly on
-- their own profile. Only visitors see the blank one.
--
-- A FIXED SURVIVING COLUMN WOULD BE WRONG EITHER WAY. Taking
-- storefront_banner_url blanks those fourteen rows. Taking banner_url blanks the
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

-- ── The five, decided by hand and pasted from capture_cover_conflicts.sql ───
-- Column order: (user_id, who, chosen_url, expected_legacy, expected_storefront).
-- The last two are what was MEASURED on 2026-09-20 and exist so the guard can
-- refuse a stale decision. `who` is the stored name verbatim, trailing spaces
-- included, because it is only ever printed in an abort message and editing it
-- would make it disagree with the row it names.
INSERT INTO cover_decisions (user_id, who, chosen_url, expected_legacy, expected_storefront) VALUES
  -- storefront. 1779744732006 > 1779469382381. BOTH on the LEGACY profile-images
  --   path, which is why a column name cannot be read as provenance.
  ('9a16aa6b-7bb9-4701-9793-1539eca7671d', 'Alexandra Aguirre',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-9a16aa6b-7bb9-4701-9793-1539eca7671d-1779744732006.jpg',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-9a16aa6b-7bb9-4701-9793-1539eca7671d-1779469382381.jpeg',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-9a16aa6b-7bb9-4701-9793-1539eca7671d-1779744732006.jpg'),
  -- legacy. 1782918797835 > 1782227634967.
  ('1848555a-8405-475a-94e2-6dd4b2f6d70e', 'Caroline Vanegas ',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-1848555a-8405-475a-94e2-6dd4b2f6d70e-1782918797835.jpg',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-1848555a-8405-475a-94e2-6dd4b2f6d70e-1782918797835.jpg',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/1848555a-8405-475a-94e2-6dd4b2f6d70e/1782227634967.jpg'),
  -- storefront. Stable-path form from the 2026-08-23 work; its cache-buster
  --   1787489844555 postdates the legacy 1781962600989. The only row not
  --   settled by comparing two upload epochs directly.
  ('eaff348f-5df3-4df5-bd80-69ec233aad0e', 'Darian',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/eaff348f-5df3-4df5-bd80-69ec233aad0e/banner?v=1787489844555',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-eaff348f-5df3-4df5-bd80-69ec233aad0e-1781962600989.png',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/eaff348f-5df3-4df5-bd80-69ec233aad0e/banner?v=1787489844555'),
  -- storefront. 1782085457928 > 1782084951804, by about eight minutes.
  ('2084307b-1bba-4343-b08d-47b80cc4535d', 'Jonathan Andres Norena Bedoya',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/2084307b-1bba-4343-b08d-47b80cc4535d/1782085457928.jpg',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-2084307b-1bba-4343-b08d-47b80cc4535d-1782084951804.jpg',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/2084307b-1bba-4343-b08d-47b80cc4535d/1782085457928.jpg'),
  -- legacy. 1781836997393 > 1781834232747.
  ('32100040-3039-4f13-88ff-6d767a41422c', 'Juan Bernardo ',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-32100040-3039-4f13-88ff-6d767a41422c-1781836997393.jpg',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-32100040-3039-4f13-88ff-6d767a41422c-1781836997393.jpg',
   'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/32100040-3039-4f13-88ff-6d767a41422c/1781834232747.jpg');

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

  IF v_only_legacy <> 14 OR v_only_new <> 3 OR v_conflict <> 5 THEN
    RAISE EXCEPTION
      '179 ABORTED: measured 2026-09-20 as 14 legacy-only, 3 new-only, 5 conflicting; '
      'found %, %, %. BEFORE CONCLUDING THE DATA MOVED, check the filters on whichever '
      'query produced the number you are comparing against: this guard reads '
      'public.users UNFILTERED and counts soft-deleted rows, and a measuring query '
      'with deleted_at IS NULL has already disagreed with it once for that reason. '
      'If the data has genuinely moved, re-measure and re-decide the conflicts -- do '
      'NOT widen this to a range.',
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
-- Presence first. coalesce takes whichever is non-null, which resolves the 14
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


-- ═══════════════════════════════════════════════════════════════════════════
-- ADDENDUM 2026-09-21 -- applied 2026-09-20, corrections appended not edited
-- ═══════════════════════════════════════════════════════════════════════════
--
-- APPLIED TO PRODUCTION 2026-09-20 under this number. Verification returned
-- with_cover 31, had_a_banner 31, and all three *_ok true.
--
-- Everything above this line is the file as it ran. Per the working agreement,
-- the executable SQL of an applied migration is immutable and its comments are
-- append-only: the header records what was believed at the time, and editing
-- it in place destroys the only account of how that belief formed.
--
-- ── 1. THE WRITE-SITE LIST NAMES A FILE THAT CANNOT WRITE ──────────────────
--
-- The header lists:
--
--     profile/edit/page.tsx                storefront_banner_url only
--
-- app/profile/edit/page.tsx does not write to the database. Its two mentions
-- of the column were setFormData calls -- form state. It contains no
-- updateUser, no .update() and no .upsert().
--
-- The writer is app/profile/edit/useEditProfile.ts:375, which the header omits.
-- So the list names the file that cannot write and leaves out the one that
-- does.
--
-- It was wrong in a second, larger way: the header implies four write sites
-- and a handful of reads. SEVENTEEN source files touched the two columns.
-- Missing from every scoping pass: SessionCard.tsx, SpotlightBanner.tsx,
-- StorefrontProfileColumn.tsx, GymStorefrontHeader.tsx,
-- dashboard/instructor/page.tsx, lib/dal/instructorDashboard.ts and
-- lib/dal/users.ts.
--
-- Both errors have one cause: the list was written from memory of the sites
-- already under discussion rather than by enumerating them. The enumeration is
-- one command and gave a different answer each time it was actually run.
--
-- The authoritative list is now lib/coverImage.singleColumn.test.ts, which is
-- executable and cannot drift silently.
--
-- ── 2. AND 3. ALREADY CORRECTED ABOVE, BEFORE THIS RAN ─────────────────────
--
-- Restated here so the addendum is a complete record, but these are NOT new:
-- both were fixed in the header above while this migration was still
-- unapplied, which is why that text reads correctly today.
--
--   * The 13 and the 14 are the same data counted two ways. The 13 came from
--     the measuring query that chose the five, which filtered
--     `deleted_at IS NULL`. The guard has no such filter and counts 14.
--
--   * The fourteenth row is the `tribe` account, soft-deleted 2026-05-21. NO
--     BANNER WAS UPLOADED. An earlier draft of this header asserted that an
--     instructor had uploaded one between the capture and the rehearsal; that
--     event did not happen, and the correction is recorded above rather than
--     removed.
--
-- The record of how the wrong pair got compared -- the guard against the
-- rehearsal, rather than the guard against the measuring query -- is in the
-- header above and in CLAUDE.md.
--
-- ── 4. cover_image_url WAS CHOSEN WITHOUT CHECKING THE NAME WAS FREE ───────
--
-- The name was endorsed on the reasoning that it is consistent -- the cover of
-- an entity -- which it is. The COLLISION WAS NOT CHECKED, by anyone, on the
-- exact question this migration existed to answer.
--
-- cover_image_url already existed on two other tables before this added a
-- third:
--
--     communities.cover_image_url
--     challenges.cover_image_url
--     users.cover_image_url        <- new, this migration
--
-- Eight source files referenced the name before the code branch existed.
--
-- THIS IS THE SAME MISS AS banner_url, which is the defect this migration was
-- written to end: banner_url exists on users AND on featured_partners, and
-- that overlap is precisely why the code guard could not be keyed on a column
-- name in either direction -- banner_url would have demanded migrating a
-- column that does not exist on featured_partners, and cover_image_url matches
-- eight files with nothing to do with users.
--
-- The name is KEPT. It is right for what it holds, the three tables are never
-- joined on it, and renaming now would cost more than the ambiguity does. What
-- is recorded is that the check was not performed.
--
-- The check is two greps and it belongs in the naming decision, not after it:
-- does this column name already exist on another table, and will any guard,
-- query or log line mentioning it be ambiguous as a result.
--
-- Fuller write-up: docs/179_cover_image_corrections.md.
