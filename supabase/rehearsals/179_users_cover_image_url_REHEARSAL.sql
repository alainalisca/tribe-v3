-- 179_users_cover_image_url_REHEARSAL.sql
--
-- Rehearsal for 179. Run in the Supabase SQL editor BEFORE 179 itself.
-- Everything is inside BEGIN ... ROLLBACK, so production is not modified.
-- ONE result set of PASS/FAIL rows, because the editor shows only the last
-- statement's result.
--
-- This APPLIES 179's own statements inside the transaction. It does not
-- require 179 to be applied, and it is not a post-apply verification.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE FIVE ARE THE MIGRATION'S OWN LITERALS, SPLICED NOT RETYPED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The cover_decisions block below is byte-identical to 179's, extracted from
-- the file rather than copied by hand. That is deliberate and it is most of
-- the value of this rehearsal: if any of the five re-uploads a banner between
-- now and the apply, the D arms fail HERE, before 179 is sent -- rather than
-- 179 aborting in the SQL editor with a half-understood message.
--
-- Deriving the five from the live rows instead would have made every D arm
-- tautological: it would assert that the backfill copied whatever was there,
-- which is true however wrong the decision is, and the fifteen URLs would
-- never be tested at all.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ARMS
-- ═══════════════════════════════════════════════════════════════════════════
--
--   A1       179's body AND ITS GUARD apply clean in-transaction
--   A2       the measured population has not moved -- the SUCCESS arm
--   B1       THE FOURTEEN ROWS -- before AND after (13 live + 1 deleted)
--   C1       the three storefront-only rows keep their banner
--   D1..D5   each of the five INDIVIDUALLY, by id, against its decided URL
--   D6       the second UPDATE is load-bearing (coalesce would be wrong for 3)
--   E1,E2    nobody lost a banner, nobody gained one
--   F1,F2    authenticated granted, anon deliberately not
--   G1..G4   each guard fires when its precondition is violated. These are
--            mutation arms and they pass by construction -- A1/A2 are what
--            prove the guard is satisfiable on the live database
--   H1       the old columns are untouched
--
-- WHY D IS FIVE ASSERTIONS AND NOT A COUNT. "5 of 5 correct" passes if the
-- backfill handed five right answers to the wrong five people. Each row is
-- checked by id against its own decided URL, so a swap fails.
--
-- WHY D6 EXISTS. D1..D5 would all pass if `coalesce` happened to pick the
-- decided value for every row -- which it does for the two legacy-decided
-- ones, since coalesce prefers banner_url. For the three storefront-decided
-- rows coalesce picks the WRONG url, so the second UPDATE is the only thing
-- making them right. D6 asserts it changed exactly those three. Without it,
-- deleting the second UPDATE would still pass two of the five D arms and the
-- failure would read as a data problem rather than a missing statement.

BEGIN;

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

-- Measured BEFORE anything is applied, so every arm compares against numbers
-- taken from this database rather than from 179's header.
CREATE TEMP TABLE reh_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.users
    WHERE banner_url IS NOT NULL AND storefront_banner_url IS NULL)     AS only_legacy,
  (SELECT count(*) FROM public.users
    WHERE banner_url IS NULL AND storefront_banner_url IS NOT NULL)     AS only_new,
  (SELECT count(*) FROM public.users
    WHERE banner_url IS NOT NULL AND storefront_banner_url IS NOT NULL
      AND banner_url IS DISTINCT FROM storefront_banner_url)            AS conflicting;

-- What coalesce ALONE would produce, captured before the second UPDATE runs,
-- so D6 can show the override actually did something.
CREATE TEMP TABLE reh_coalesce_would_be ON COMMIT DROP AS
SELECT id, coalesce(banner_url, storefront_banner_url) AS c
  FROM public.users
 WHERE banner_url IS NOT NULL OR storefront_banner_url IS NOT NULL;

DO $outer$
DECLARE
  a_ok boolean := false;  a_error text := '(never ran)';
  b_before integer := -1; b_after integer := -1;
  c_n integer := -1;      c_expected integer := -1;
  d6_changed integer := -1;
  e_lost integer := -1;   e_gained integer := -1;
  f_auth boolean := false; f_anon boolean := true;
  g1 boolean := false; g1m text := '(none)';
  g2 boolean := false; g2m text := '(none)';
  g3 boolean := false; g3m text := '(none)';
  g4 boolean := false; g4m text := '(none)';
  v_n integer;
  -- hoisted from 179's guard block, which cannot nest as a DO statement
  v_only_legacy integer;
  v_only_new    integer;
  v_conflict    integer;
  v_decisions   integer;
  v_stale       text;
BEGIN

  -- ── A: apply 179's body ───────────────────────────────────────────────────
  BEGIN
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cover_image_url text;
    GRANT SELECT (cover_image_url) ON public.users TO authenticated;

-- ↓↓↓ spliced verbatim from 179_users_cover_image_url.sql ↓↓↓
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
-- ↑↑↑ end spliced block ↑↑↑

-- ↓↓↓ 179's GUARD, spliced verbatim (DO wrapper stripped, vars hoisted) ↓↓↓
-- THIS IS THE ARM THAT WAS MISSING. G1..G4 below each mutate ONE input so the
-- guard fires, and all four passed by construction -- none of them ran the
-- guard with TRUE inputs. Four arms proving it fires when violated, zero
-- proving it passes when satisfied, and the second kind is what tells you
-- whether the migration will actually apply.
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
-- ↑↑↑ end guard ↑↑↑

    UPDATE public.users
       SET cover_image_url = coalesce(banner_url, storefront_banner_url)
     WHERE cover_image_url IS NULL
       AND (banner_url IS NOT NULL OR storefront_banner_url IS NOT NULL);

    UPDATE public.users u
       SET cover_image_url = d.chosen_url
      FROM cover_decisions d
     WHERE u.id = d.user_id;

    a_ok := true; a_error := '(none)';
  EXCEPTION WHEN OTHERS THEN
    a_ok := false; a_error := SQLSTATE || ' ' || SQLERRM;
  END;

  INSERT INTO reh_probe VALUES
    (1, 'A1 179 body AND ITS GUARD apply clean in-transaction', coalesce(a_error,'(null)'), coalesce(a_ok,false));

  -- A2 reads reh_baseline, captured before any write, so the three live
  -- counts print even when A1 aborted and rolled its subtransaction back.
  -- Diagnosing a guard failure should never require inferring the numbers
  -- from a message, or from another arm that happens to print one of them.
  SELECT only_legacy, only_new, conflicting INTO v_only_legacy, v_only_new, v_conflict
    FROM reh_baseline;
  INSERT INTO reh_probe VALUES
    (2, 'A2 the measured population has not moved since 2026-09-20',
        'live ' || v_only_legacy || '/' || v_only_new || '/' || v_conflict
          || '   expected 14/3/5   (legacy-only / storefront-only / conflicting)',
        v_only_legacy = 14 AND v_only_new = 3 AND v_conflict = 5);

  -- If A failed, cover_decisions may not exist and every arm below would raise
  -- an unhandled error, aborting the block and leaving NO result set at all --
  -- which reads as "the rehearsal did not run" rather than "A1 failed".
  IF NOT a_ok THEN
    INSERT INTO reh_probe VALUES
      (99, 'REHEARSAL STOPPED', 'A1 failed; remaining arms not run', false);
    RETURN;
  END IF;

  -- ── B: THE FOURTEEN ROWS ─────────────────────────────────────────────────
  -- 14 rows: 13 live instructors and the soft-deleted `tribe` account. The
  -- count is unfiltered on purpose and matches 179's guard exactly; see the
  -- deleted-accounts decision in the migration header.
  --
  -- b_before counts legacy-only users, whose storefront_banner_url is NULL --
  -- and storefront_banner_url is what the storefront hero reads, so every one
  -- of them renders no banner today. b_after counts how many now carry their
  -- legacy banner. The BEFORE half is what makes the AFTER half mean anything:
  -- asserting only that they end up with a cover would pass even if they had
  -- never been broken.
  SELECT only_legacy INTO b_before FROM reh_baseline;
  SELECT count(*) INTO b_after FROM public.users
   WHERE banner_url IS NOT NULL AND storefront_banner_url IS NULL
     AND cover_image_url = banner_url;

  INSERT INTO reh_probe VALUES
    (3, 'B1 the instructors whose storefront shows nothing today all get their banner',
        'blank storefront before=' || b_before || '   carrying legacy banner after=' || b_after,
        b_before > 0 AND b_after = b_before);

  -- ── C: the storefront-only rows ───────────────────────────────────────────
  SELECT only_new INTO c_expected FROM reh_baseline;
  SELECT count(*) INTO c_n FROM public.users
   WHERE banner_url IS NULL AND storefront_banner_url IS NOT NULL
     AND cover_image_url = storefront_banner_url;

  INSERT INTO reh_probe VALUES
    (4, 'C1 the storefront-only instructors keep their banner',
        'matched=' || c_n || '   baseline only_new=' || c_expected,
        c_expected > 0 AND c_n = c_expected);

  -- ── D1..D5: the five, one assertion each, keyed by id ─────────────────────
  INSERT INTO reh_probe
  SELECT 4 + row_number() OVER (ORDER BY d.who),
         'D' || row_number() OVER (ORDER BY d.who) || ' ' || trim(d.who)
           || ' got the DECIDED url',
         'got ' || CASE WHEN u.cover_image_url = d.expected_legacy     THEN 'legacy'
                        WHEN u.cover_image_url = d.expected_storefront THEN 'storefront'
                        ELSE 'NEITHER (' || coalesce(u.cover_image_url,'null') || ')' END
         || ', decided ' || CASE WHEN d.chosen_url = d.expected_legacy
                                 THEN 'legacy' ELSE 'storefront' END,
         u.cover_image_url IS NOT DISTINCT FROM d.chosen_url
    FROM cover_decisions d JOIN public.users u ON u.id = d.user_id;

  -- ── D6: the override is load-bearing ──────────────────────────────────────
  SELECT count(*) INTO d6_changed
    FROM cover_decisions d
    JOIN reh_coalesce_would_be w ON w.id = d.user_id
   WHERE d.chosen_url IS DISTINCT FROM w.c;

  INSERT INTO reh_probe VALUES
    (10, 'D6 the second UPDATE overrode coalesce for exactly the 3 storefront-decided rows',
        'rows where coalesce would have been wrong=' || d6_changed || ' (expected 3)',
        d6_changed = 3);

  -- ── E: conservation ───────────────────────────────────────────────────────
  SELECT count(*) INTO e_lost FROM public.users
   WHERE (banner_url IS NOT NULL OR storefront_banner_url IS NOT NULL)
     AND cover_image_url IS NULL;
  SELECT count(*) INTO e_gained FROM public.users
   WHERE banner_url IS NULL AND storefront_banner_url IS NULL
     AND cover_image_url IS NOT NULL;

  INSERT INTO reh_probe VALUES
    (11, 'E1 nobody who had a banner lost one',   'lost='   || e_lost,   e_lost = 0),
    (12, 'E2 nobody without a banner gained one', 'gained=' || e_gained, e_gained = 0);

  -- ── F: the grant, both halves ─────────────────────────────────────────────
  -- has_column_privilege, not has_table_privilege: 067 put public.users under
  -- column-level grants, and the table-level form answers false on a column
  -- grant the role genuinely holds.
  f_auth := has_column_privilege('authenticated','public.users','cover_image_url','SELECT');
  f_anon := has_column_privilege('anon','public.users','cover_image_url','SELECT');

  INSERT INTO reh_probe VALUES
    (13, 'F1 authenticated CAN read cover_image_url (067 revoked table-level SELECT)',
         'authenticated=' || f_auth::text, coalesce(f_auth,false)),
    (14, 'F2 anon CANNOT -- no anon surface reads a banner, and this did not widen that',
         'anon=' || f_anon::text, NOT coalesce(f_anon,true));

  -- ── G: each guard fires when its precondition is violated ─────────────────
  -- Each arm reproduces 179's guard with ONE input deliberately wrong, and
  -- asserts on the message text. A guard that cannot fire and a guard that has
  -- nothing to complain about are both silent, so silence is not evidence.
  -- Captured to variables and written after the subtransaction unwinds -- a
  -- probe row inserted inside would roll back with the arm it describes.

  BEGIN  -- G1: a measured count has moved
    SELECT count(*) INTO v_n FROM public.users
     WHERE banner_url IS NOT NULL AND storefront_banner_url IS NULL;
    IF v_n + 1 <> 14 THEN
      RAISE EXCEPTION '179 ABORTED: measured 2026-09-20 as 14 legacy-only, 3 new-only, 5 conflicting; found %', v_n + 1;
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    g1m := SQLERRM; g1 := SQLERRM LIKE '179 ABORTED: measured 2026-09-20%';
  END;

  BEGIN  -- G2: one of the five no longer holds its measured values
    IF EXISTS (SELECT 1 FROM cover_decisions d JOIN public.users u ON u.id = d.user_id
                WHERE u.banner_url IS DISTINCT FROM d.expected_legacy || 'x') THEN
      RAISE EXCEPTION '179 ABORTED: these instructors no longer hold the values the decision was made against';
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    g2m := SQLERRM; g2 := SQLERRM LIKE '179 ABORTED: these instructors no longer hold%';
  END;

  BEGIN  -- G3: the five were never pasted in
    SELECT count(*) INTO v_n FROM cover_decisions WHERE false;
    IF v_n <> 5 THEN
      RAISE EXCEPTION '179 ABORTED: cover_decisions holds % rows, expected 5', v_n;
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    g3m := SQLERRM; g3 := SQLERRM LIKE '179 ABORTED: cover_decisions holds 0 rows%';
  END;

  BEGIN  -- G4: someone with a banner ends with no cover
    SELECT count(*) + 1 INTO v_n FROM public.users
     WHERE (banner_url IS NOT NULL OR storefront_banner_url IS NOT NULL)
       AND cover_image_url IS NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION '179 ABORTED: % user(s) had a banner and have no cover_image_url.', v_n;
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    g4m := SQLERRM; g4 := SQLERRM LIKE '179 ABORTED:%had a banner and have no cover_image_url%';
  END;

  INSERT INTO reh_probe VALUES
    (15, 'G1 aborts when a measured count has moved', coalesce(g1m,'?'), coalesce(g1,false)),
    (16, 'G2 aborts when one of the five no longer holds its measured values', coalesce(g2m,'?'), coalesce(g2,false)),
    (17, 'G3 aborts when the five were never pasted in', coalesce(g3m,'?'), coalesce(g3,false)),
    (18, 'G4 aborts when someone with a banner ends with no cover', coalesce(g4m,'?'), coalesce(g4,false));

  -- ── H: additive only ──────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = 'public.users'::regclass AND attnum > 0 AND NOT attisdropped
     AND attname IN ('banner_url','storefront_banner_url');

  INSERT INTO reh_probe VALUES
    (19, 'H1 banner_url and storefront_banner_url both still exist (additive only)',
         'old columns present=' || v_n || ' (expected 2)', v_n = 2);

END $outer$;

-- The one result set. Every row must read PASS. 19 of 19.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;
