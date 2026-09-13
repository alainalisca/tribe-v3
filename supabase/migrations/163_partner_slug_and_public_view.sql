-- 163_partner_slug_and_public_view.sql
--
-- T-GYM3. Gives every featured partner a permanent, human-readable URL segment
-- and a public projection to read it through, so /g/[slug] can render for a
-- logged-out visitor.
--
-- Two changes in one migration because Part B's view selects the column Part A
-- adds; they cannot be split without the view being created twice.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  THE SLUG IS PERMANENT.                                                  ║
-- ║                                                                          ║
-- ║  It goes in an Instagram bio. Once it is published it cannot be recalled ║
-- ║  -- a changed slug is a dead link on someone else's profile, and we do   ║
-- ║  not control that profile. Treat a slug edit as a breaking change to a   ║
-- ║  public URL, not as a content edit.                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Grant context, verified live before writing this (T-GYM3 recon):
--   anon SELECT, authenticated SELECT/INSERT/UPDATE on featured_partners are
--   all table-level and all true. There is NO column-level grant regime on this
--   table, so the new column needs no GRANT -- unlike public.users, where 156
--   added two columns under 066's column-level regime with no grant and broke
--   onboarding for three attempts running. If anyone ever converts
--   featured_partners to a column-level regime, slug must be in the re-grant.

-- ══════════════════════════════════════════════════════════════════════════
-- PART A — the slug
-- ══════════════════════════════════════════════════════════════════════════

-- a1. Nullable to begin with. NOT NULL is added in a6, after the backfill has
--     been proved complete; adding it here would fail on the three live rows.
ALTER TABLE public.featured_partners ADD COLUMN IF NOT EXISTS slug text;

-- a2. Name -> slug.
--
-- WHY translate() AND NOT unaccent():
--
--   1. unaccent(text) -- the one-argument form -- is STABLE, not IMMUTABLE,
--      because its result depends on the unaccent dictionary, which is mutable
--      configuration. Declaring this function IMMUTABLE (which it must be, so
--      it can be used in the backfill and in any future generated column or
--      expression index) while calling a STABLE function inside it is a lie to
--      the planner. Only the two-argument dictionary-qualified form is
--      IMMUTABLE, and that form pins us to a dictionary name.
--   2. On Supabase, extensions install into the `extensions` schema, so using
--      it would force `extensions` into the pinned search_path below, widening
--      exactly the surface this function is pinning shut.
--   3. Migration 055 already faced this and chose the same way, for Medellín
--      neighbourhood names (see its lines 60-64).
--
-- The character set covers Spanish in full (á é í ó ú ü ñ ç and the à â ã ò õ
-- è ê ì î ù û that appear in Portuguese and French business names in Medellín),
-- both cases, so "Medellín" -> "medellin" and "Ñ" -> "n".
CREATE OR REPLACE FUNCTION public.slugify_partner_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
-- Pinned. There is an open ticket for is_app_admin()'s unpinned search_path;
-- this does not add a second instance.
SET search_path = public, pg_catalog
AS $fn$
  SELECT nullif(
           trim(BOTH '-' FROM
             left(
               trim(BOTH '-' FROM
                 regexp_replace(
                   lower(
                     translate(
                       coalesce(p_name, ''),
                       'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                       'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
                     )
                   ),
                   '[^a-z0-9]+', '-', 'g'
                 )
               ),
               80
             )
           ),
           ''
         );
$fn$;

COMMENT ON FUNCTION public.slugify_partner_name(text) IS
  'business_name -> URL segment for /g/[slug]. Spanish-safe via translate(); '
  'see 163 for why not unaccent(). Returns NULL when nothing survives, so the '
  'caller must supply a fallback.';

-- a3. Fill the slug on insert so a future partner application cannot fail the
--     NOT NULL added in a6. applyForPartnership() (lib/dal/featuredPartners.ts)
--     names its columns explicitly and has no slug field, so without this
--     trigger every new application would error the moment a6 lands.
--
--     It must NEVER overwrite a slug that is already set: that is the whole
--     permanence guarantee. The guard is the first statement in the body.
CREATE OR REPLACE FUNCTION public.set_partner_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  base      text;
  candidate text;
  suffix    text;
  n         int := 1;
BEGIN
  -- A slug that exists is published. Never touch it.
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 'partner' covers a business_name from which no [a-z0-9] survives (an
  -- all-emoji or all-CJK name). The collision loop below then makes it unique.
  base := coalesce(public.slugify_partner_name(NEW.business_name), 'partner');
  candidate := base;

  WHILE EXISTS (
    SELECT 1
    FROM public.featured_partners
    WHERE slug = candidate
      AND id IS DISTINCT FROM NEW.id
  ) LOOP
    n := n + 1;
    suffix := '-' || n::text;
    -- Trim the base, not the suffix, so the result stays inside the 80-char
    -- CHECK. rtrim keeps us off a "name--2" double hyphen.
    candidate := rtrim(left(base, 80 - length(suffix)), '-') || suffix;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_set_partner_slug ON public.featured_partners;
CREATE TRIGGER trg_set_partner_slug
  BEFORE INSERT OR UPDATE ON public.featured_partners
  FOR EACH ROW
  EXECUTE FUNCTION public.set_partner_slug();

-- a4. Backfill the three live rows explicitly, rather than relying on the
--     trigger firing from a no-op UPDATE.
UPDATE public.featured_partners
   SET slug = coalesce(public.slugify_partner_name(business_name), 'partner')
 WHERE slug IS NULL;

-- Al's call, deliberately overriding the derived value.
--   derived:  crossfit-bullbox
--   published: bullbox
-- This is the string that goes in the Instagram bio, so it is the string that
-- has to be right. Shorter, and it is what the box is called.
UPDATE public.featured_partners
   SET slug = 'bullbox'
 WHERE id = '040cbc21-1b11-4ae1-aa99-9fe35a32bda0';

-- a5. Prove the backfill before constraining the column. If either check fires,
--     the whole migration rolls back and the table is untouched.
DO $$
DECLARE
  n_null int;
  dupes  text;
BEGIN
  SELECT count(*) INTO n_null FROM public.featured_partners WHERE slug IS NULL;
  IF n_null > 0 THEN
    RAISE EXCEPTION '163: % featured_partners rows still have a NULL slug', n_null;
  END IF;

  SELECT string_agg(slug, ', ' ORDER BY slug) INTO dupes
  FROM (
    SELECT slug FROM public.featured_partners GROUP BY slug HAVING count(*) > 1
  ) d;
  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION '163: duplicate partner slugs: %', dupes;
  END IF;
END $$;

-- a6. Constrain, now that a5 has proved it is safe to. Same CHECK shape as the
--     Tribe OS gyms table (068_gym_tenant_schema.sql:54) so the two slug
--     columns cannot drift apart.
CREATE UNIQUE INDEX IF NOT EXISTS featured_partners_slug_key
  ON public.featured_partners (slug);

ALTER TABLE public.featured_partners
  DROP CONSTRAINT IF EXISTS featured_partners_slug_check;
ALTER TABLE public.featured_partners
  ADD CONSTRAINT featured_partners_slug_check
  CHECK (char_length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9-]+$');

ALTER TABLE public.featured_partners ALTER COLUMN slug SET NOT NULL;

-- a7. The warning lives on the column, where anyone writing a policy will read
--     it.
COMMENT ON COLUMN public.featured_partners.slug IS
  'PUBLIC BIO-LINK URL SEGMENT for /g/[slug]. Permanent once published: a '
  'wrong value cannot be recalled, because the link lives on someone else''s '
  'Instagram profile. '
  'SECURITY: `authenticated` holds TABLE-LEVEL UPDATE on featured_partners. '
  'The ONLY thing stopping a client rewriting any partner''s slug is that '
  'migration 104 dropped the owner-UPDATE RLS policy and never replaced it, so '
  'no UPDATE policy grants an ordinary user any row. If anyone adds an '
  'owner-UPDATE policy to this table, slug becomes client-rewritable and live '
  'bio links break. Any such policy MUST exclude slug, or the write MUST go '
  'through a SECURITY DEFINER function (see 104''s self_activate_featured_partner).';

-- ══════════════════════════════════════════════════════════════════════════
-- PART B — partners_public
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY A VIEW AND NOT A POLICY CHANGE:
--
-- featured_partners' SELECT policy is (status = 'active' OR is_app_admin()).
-- Under it a logged-out visitor sees a partner only while the sponsorship is
-- active. All three live partners carry real expiry dates and two of them lapse
-- inside six months. Shipping bio links against that policy means shipping URLs
-- with a built-in expiration date.
--
-- The policy is NOT loosened: the banner, discovery and the owner console all
-- read featured_partners and may be relying on it to filter. This mirrors
-- exactly what 140 did with sessions_public -- an owner-executed view
-- (security_invoker = false) runs as postgres and therefore bypasses RLS on the
-- base table, so the SELECT list below IS the security boundary.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  EVERY COLUMN IN THIS VIEW IS PUBLIC TO ANYONE HOLDING THE ANON KEY,     ║
-- ║  WHICH SHIPS IN THE CLIENT BUNDLE. ADDING A COLUMN HERE IS A SECURITY    ║
-- ║  CHANGE, NOT A FEATURE CHANGE.                                           ║
-- ║                                                                          ║
-- ║  DELIBERATELY EXCLUDED, and they must stay excluded:                     ║
-- ║    monthly_fee_cents        what the partner pays Tribe                  ║
-- ║    min_sessions_per_month   contract minimum                             ║
-- ║    min_rating               contract minimum                             ║
-- ║    total_impressions        commercial performance                       ║
-- ║    total_clicks             commercial performance                       ║
-- ║    total_bookings           commercial performance                       ║
-- ║    tier, status,            commercial state                             ║
-- ║    starts_at, expires_at    contract dates                               ║
-- ║    auto_approve_roster      internal moderation setting                  ║
-- ║    user_id                  joins the business to a person's account     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- The WHERE clause excludes ONLY 'pending'. An expired or lapsed partner stays
-- publicly readable, which is the entire point: the bio link has to survive the
-- sponsorship. A pending applicant has not consented to a public page, and this
-- view is listable over PostgREST by anyone.
--
-- No security_barrier, matching sessions_public.
DROP VIEW IF EXISTS public.partners_public;
CREATE VIEW public.partners_public
WITH (security_invoker = false) AS
SELECT
  fp.id,
  fp.slug,
  fp.business_name,
  fp.business_type,
  fp.description,
  fp.description_es,
  fp.logo_url,
  -- The image the page actually renders.
  --
  -- All three live partners have logo_url = NULL and their only image is the
  -- partner account's avatar. Three client surfaces already fall back to it
  -- (partnerLogoUrl in lib/dal/featuredPartners.ts) via a PostgREST embed on
  -- user_id -- but user_id is excluded above, and PostgREST cannot embed from a
  -- view with no foreign key anyway. Without this column /g/[slug] and its
  -- WhatsApp preview card would render a "CB" monogram for BullBox while every
  -- other surface in the app shows its real image.
  --
  -- This EXPOSES NOTHING NEW: anon can already read users.avatar_url through
  -- that embed today (probed with the live anon key, T-GYM3 recon). It is
  -- strictly narrower than exposing user_id, because it is one image URL rather
  -- than a join key.
  --
  -- LEFT JOIN so a partner whose owner account was deleted still resolves.
  coalesce(fp.logo_url, u.avatar_url) AS logo_image_url,
  fp.banner_url,
  fp.website_url,
  fp.phone,
  fp.address,
  fp.lat,
  fp.lng,
  fp.specialties,
  fp.display_order
FROM public.featured_partners fp
LEFT JOIN public.users u ON u.id = fp.user_id
WHERE fp.status IS DISTINCT FROM 'pending';

GRANT SELECT ON public.partners_public TO anon, authenticated;

COMMENT ON VIEW public.partners_public IS
  'Public gym/partner profile source for /g/[slug]. Owner-executed '
  '(security_invoker = false), so it bypasses RLS on featured_partners and THE '
  'COLUMN LIST IS THE SECURITY BOUNDARY -- every column here is readable by '
  'anyone holding the anon key. Deliberately ignores status except to exclude '
  '''pending'', so a bio link survives a lapsed sponsorship; a pending '
  'applicant has not consented to a public page. Never add a commercial column '
  '(monthly_fee_cents, min_*, total_*, tier, status, starts_at, expires_at, '
  'auto_approve_roster) or user_id. Mirrors 140''s sessions_public.';

-- b4. Guard. Style follows 162: assert the outcome, do not trust the statements.
DO $$
DECLARE
  n_null   int;
  n_dupe   int;
  leaked   text;
BEGIN
  -- slug is populated and unique
  SELECT count(*) INTO n_null FROM public.featured_partners WHERE slug IS NULL;
  IF n_null > 0 THEN
    RAISE EXCEPTION '163 guard: % partner rows have a NULL slug', n_null;
  END IF;

  SELECT count(*) INTO n_dupe FROM (
    SELECT slug FROM public.featured_partners GROUP BY slug HAVING count(*) > 1
  ) d;
  IF n_dupe > 0 THEN
    RAISE EXCEPTION '163 guard: % duplicated partner slugs', n_dupe;
  END IF;

  -- the view exists
  IF to_regclass('public.partners_public') IS NULL THEN
    RAISE EXCEPTION '163 guard: public.partners_public does not exist';
  END IF;

  -- anon can read it. has_table_privilege resolves table-level grants;
  -- information_schema.table_privileges cannot see them and would pass either
  -- way (the false-pass that nearly hid the 156/157 onboarding bug).
  IF NOT has_table_privilege('anon', 'public.partners_public', 'SELECT') THEN
    RAISE EXCEPTION '163 guard: anon cannot SELECT public.partners_public -- '
                    'every bio link would return an empty page';
  END IF;

  -- and it leaks no commercial column
  SELECT string_agg(attname, ', ' ORDER BY attname) INTO leaked
  FROM pg_attribute
  WHERE attrelid = 'public.partners_public'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attname IN (
      'monthly_fee_cents', 'min_sessions_per_month', 'min_rating',
      'total_impressions', 'total_clicks', 'total_bookings',
      'tier', 'status', 'starts_at', 'expires_at',
      'auto_approve_roster', 'user_id'
    );
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION '163 guard: partners_public exposes commercial column(s) to '
                    'anon: %', leaked;
  END IF;
END $$;
