-- 161_featured_partners_display_order.sql
--
-- Editorial placement for the Featured Affiliate carousel, and later for the
-- "Gimnasios y estudios" discover section.
--
-- WHY A NEW COLUMN RATHER THAN tier
-- fetchActivePartners orders `tier` DESC, then `total_impressions` ASC. Neither
-- is usable for placement:
--   * tier is a COMMERCIAL field. Using it to put BullBox first would say
--     BullBox appears first because it pays more, which is not true, and would
--     quietly establish a rule nobody decided to set (Al, 2026-09-10).
--   * total_impressions ASC deliberately churns -- whoever has been seen least
--     floats to the front -- so any position won through it is temporary by
--     design. That rotation is a feature and this must not fight it.
-- display_order is explicit editorial placement and nothing else. It sorts
-- ahead of both, so it decides the front of the list while impressions keep
-- rotating everything that ties at 0.
--
-- All three live partners currently tie on tier AND impressions, so today's
-- order is unspecified and BullBox happens to land third.
--
-- GRANTS
-- public.featured_partners is NOT under a column-level grant regime. 158's
-- revoke-and-re-grant applied to public.sessions ONLY; no migration has ever
-- revoked table-level SELECT or UPDATE on featured_partners. A new column here
-- therefore inherits the table-level grants automatically, and the GRANT below
-- is belt-and-braces rather than load-bearing -- kept for the same reason 158's
-- redundant grants were: it costs nothing and it is what survives if this table
-- ever does get the 066 treatment.
--
-- NO GRANT UPDATE, NOW OR LATER. This is a recommendation, not an open
-- question (Al, 2026-09-10): `authenticated` should never hold UPDATE on
-- display_order. Merchandising order belongs to the platform, not to the
-- partner -- a partner who can write it can promote themselves to the front of
-- the carousel, which is the one thing the column exists to decide deliberately.
--
-- When a dashboard control is built, route it through an admin-only path on the
-- service role (an API route with an is_app_admin check, or a SECURITY DEFINER
-- RPC in the shape of review_venue_request from 158). Do not solve it with a
-- grant.
--
-- For reference, the table has no column-level regime today, so UPDATE here is
-- governed by the table-level grant plus RLS. If that ever changes, this is the
-- check -- but the answer to a `false` is an admin path, not a GRANT:
--   select has_column_privilege('authenticated','public.featured_partners',
--                               'display_order','UPDATE');

ALTER TABLE public.featured_partners
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

GRANT SELECT (display_order) ON public.featured_partners TO authenticated, anon;

COMMENT ON COLUMN public.featured_partners.display_order IS
  'Editorial placement, highest first. Sorted ahead of tier so commercial tier '
  'never doubles as merchandising. 0 = unplaced, the default (T-GYM1).';
