-- 222_t_join1b_session_is_test.sql
--
-- T-JOIN1b: "Sesión de prueba". A host or an admin marks one session as a
-- test; the app hides it from the feed, search, the site, coach pages, the
-- sitemap and the share card, and only its host and admins can open it. Al
-- (admin) can then host real sessions everyone sees, since the admin filter
-- leaves the visibility rule (lib/dal/visibleUsers.ts) in the same change.
-- NOT APPLIED when written (2026-10-18).
--
-- ADDITIVE ONLY:
--   1. sessions.is_test boolean NOT NULL DEFAULT false. Every existing row
--      reads false, so nothing is hidden by this file alone.
--   2. INSERT (is_test) and UPDATE (is_test) for authenticated. Since 158 the
--      role writes sessions through a column list; without this grant the
--      switch would fail on save. RLS still limits writes to the host's own
--      sessions. SELECT needs nothing: authenticated holds the table grant,
--      and anon reads through sessions_public.
--   3. sessions_public gains is_test as its LAST column (CREATE OR REPLACE
--      VIEW may only append). Same rows, same filter (invite_only excluded),
--      same owner semantics (security_invoker = false), same grants.
--
-- ORDER: this file first, then the code that reads the column (the code
-- selects is_test and would fail on a database without it).

BEGIN;

-- Pre-flight. The capture rule (CLAUDE.md): sessions_public must be exactly
-- 158's column list, or this file's own on a re-run. Anything else is a later
-- change this file would silently revert.
DO $$
DECLARE
  v_cols text[];
  v_158 text[] := ARRAY['id','title','sport','date','start_time','end_time','duration','description','equipment','skill_level','photos','max_participants','current_participants','waitlist_count','join_policy','status','is_paid','price_cents','currency','creator_id','creator_name','creator_avatar_url','creator_average_rating','location','latitude','longitude','location_lat','location_lng','partner_id','partner_status','partner_reviewed_at'];
BEGIN
  SELECT array_agg(column_name::text ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sessions_public';
  IF v_cols IS DISTINCT FROM v_158 AND v_cols IS DISTINCT FROM (v_158 || ARRAY['is_test']) THEN
    RAISE EXCEPTION '222 ABORTED: sessions_public is not 158''s view (columns: %); a later change would be reverted.', v_cols;
  END IF;
  IF pg_get_viewdef('public.sessions_public'::regclass) !~ 'invite_only' THEN
    RAISE EXCEPTION '222 ABORTED: sessions_public no longer excludes invite_only sessions; not 158''s view.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'is_test'
                AND (data_type <> 'boolean' OR is_nullable <> 'NO')) THEN
    RAISE EXCEPTION '222 ABORTED: sessions.is_test exists with another type or nullability.';
  END IF;
END $$;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sessions.is_test IS
  'T-JOIN1b: a test session (Sesión de prueba). Hidden from every public list and the share card; only its host and admins can open it.';

GRANT INSERT (is_test), UPDATE (is_test) ON public.sessions TO authenticated;

CREATE OR REPLACE VIEW public.sessions_public
WITH (security_invoker = false) AS
SELECT
  s.id,
  s.title,
  s.sport,
  s.date,
  s.start_time,
  s.end_time,
  s.duration,
  s.description,
  s.equipment,
  s.skill_level,
  s.photos,
  s.max_participants,
  s.current_participants,
  s.waitlist_count,
  s.join_policy,
  s.status,
  s.is_paid,
  s.price_cents,
  s.currency,
  s.creator_id,
  u.name AS creator_name,
  u.avatar_url AS creator_avatar_url,
  u.average_rating AS creator_average_rating,
  s.location,
  -- BOTH coordinate pairs rounded to 3dp; different consumers read different
  -- pairs, so rounding only one would leak precise coords through the other.
  -- round() has no (double precision, int) overload -> ::numeric cast.
  round(s.latitude::numeric, 3) AS latitude,
  round(s.longitude::numeric, 3) AS longitude,
  round(s.location_lat::numeric, 3) AS location_lat,
  round(s.location_lng::numeric, 3) AS location_lng,
  -- T-GYM1
  s.partner_id,
  s.partner_status,
  s.partner_reviewed_at,
  -- 222 (T-JOIN1b): appended last, as CREATE OR REPLACE VIEW requires. The
  -- rows are unchanged; the app hides test sessions where it lists them.
  s.is_test
FROM public.sessions s
LEFT JOIN public.users u ON u.id = s.creator_id
-- invite_only sessions are EXCLUDED from the anon view (see 138's header). IS
-- DISTINCT FROM (not <>) so a NULL join_policy -- an unset, non-private session
-- -- stays discoverable rather than being dropped by NULL-comparison semantics.
WHERE s.join_policy IS DISTINCT FROM 'invite_only';

-- Post-flight: what the app relies on.
DO $$
DECLARE
  v_last text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'is_test'
                    AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false') THEN
    RAISE EXCEPTION '222 ABORTED: sessions.is_test is not boolean NOT NULL DEFAULT false.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sessions WHERE is_test) THEN
    RAISE EXCEPTION '222 ABORTED: a session reads is_test = true; this file marks none.';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.sessions', 'is_test', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.sessions', 'is_test', 'UPDATE') THEN
    RAISE EXCEPTION '222 ABORTED: authenticated cannot write sessions.is_test; the switch would fail.';
  END IF;
  SELECT column_name INTO v_last FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sessions_public'
   ORDER BY ordinal_position DESC LIMIT 1;
  IF v_last IS DISTINCT FROM 'is_test' THEN
    RAISE EXCEPTION '222 ABORTED: sessions_public does not end with is_test (last column: %).', v_last;
  END IF;
  IF pg_get_viewdef('public.sessions_public'::regclass) !~ 'invite_only' THEN
    RAISE EXCEPTION '222 ABORTED: sessions_public lost its invite_only filter.';
  END IF;
  IF NOT has_table_privilege('anon', 'public.sessions_public', 'SELECT') THEN
    RAISE EXCEPTION '222 ABORTED: anon lost SELECT on sessions_public; every public page would break.';
  END IF;
  RAISE NOTICE '222: sessions.is_test added (all false), writable by hosts, exposed last in sessions_public.';
END $$;

INSERT INTO public.migrations_applied (migration, note)
VALUES ('222_t_join1b_session_is_test',
        'T-JOIN1b: sessions.is_test boolean NOT NULL DEFAULT false, INSERT/UPDATE for authenticated, appended to sessions_public')
ON CONFLICT (migration) DO NOTHING;

COMMIT;
