-- PROGRAM: T-GROW Growth Engine
-- TICKET: T-GROW1 parts D and F
-- TABLE: public.attribution_events OWNER: consumer (new)
-- CREATES: table public.attribution_events, 2 indexes, function public.admin_attribution_summary(timestamptz)
-- RISK: MEDIUM
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-GROW1 (3 of 3): the visit log, and the one read the Origen tab makes
-- ════════════════════════════════════════════════════════════════════════════
--
-- 213 was free on origin/main (highest 210, 549a8fe4), every branch, every
-- worktree and all history, re-read 2026-10-08 at the moment of writing.
--
-- WHY A LOG AT ALL, WHEN pass_leads ALREADY CARRIES THE SOURCE
--   pass_leads answers "where did the people who left their number come from".
--   It cannot answer "how many people saw the thing and did not", which is the
--   denominator of every conversion number in this program and the only way a
--   channel that sends traffic but never converts can be told apart from a
--   channel that sends nobody. Those look identical in the leads table: both
--   are an absence of rows.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT IS DELIBERATELY NOT IN THIS TABLE
-- ════════════════════════════════════════════════════════════════════════════
--
-- NO user id, and this is a privacy decision rather than a scoping one. The
-- T-GROW0 privacy gate found that the published Politica de tratamiento de
-- datos v1.0 covers recording a campaign code against a PASS LEAD (section 3)
-- and campaign measurement generally (section 4), and does NOT cover recording
-- how a person arrived on their ACCOUNT. Joining a visit to a user id is that
-- uncovered purpose reached by a different route, so it waits for v1.1 along
-- with spec part C. A row here is a tagged visit and is not a person.
--
-- NO ip address, ever. The rate limit needs one for ten minutes and
-- lib/rate-limit.ts already holds it in public.rate_limits for that long; a
-- permanent column would turn a counter into a location history.
--
-- NO user agent. /api/pase stores one on a lead because a disputed consent has
-- to be defensible. A visit count has nothing to defend.
--
-- NO foreign key to pass_leads. A visit precedes the lead, most visits never
-- become one, and the join that matters (which channel produced which lead)
-- lives on the lead row through 211's columns. A nullable FK here would invite
-- someone to read "visits with no lead" as a funnel and get it wrong, because
-- it would only ever be populated after the fact by code that does not exist.
--
-- ════════════════════════════════════════════════════════════════════════════
-- session_key, AND WHY ONCE-PER-SESSION IS A DATABASE GUARANTEE
-- ════════════════════════════════════════════════════════════════════════════
--
-- The spec says "on first tagged visit per session". The client holds an opaque
-- random key in sessionStorage and sends it, and lib/attribution.ts only fires
-- once per session -- but a client-side flag is a request the server has no way
-- to verify, and a double-fired visit inflates exactly the denominator this
-- table exists to provide. attribution_events_one_visit_per_session makes it
-- unenforceable to get wrong: a second 'visit' for the same key is a unique
-- violation the route swallows, which is the same shape /api/pase uses for
-- pass_code collisions.
--
-- PARTIAL, on visit only. A share_click is a real repeated action -- someone can
-- share twice from the same session and both are true -- so bounding those is
-- the rate limit's job, not the index's.
--
-- The key is NOT a user identifier and must not become one: it is generated
-- client-side with no reference to any account, dies with the tab, and is here
-- for deduplication. It is bounded to the charset the generator emits so it
-- cannot be used to smuggle a payload into the column.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY NO POLICY, RATHER THAN A POLICY NOBODY MATCHES
-- ════════════════════════════════════════════════════════════════════════════
--
-- RLS is enabled and there are zero policies, which denies every RLS-bound role
-- all access. That is deliberate and is the narrowest available state, not an
-- oversight:
--
--   * The only writer is POST /api/attr, a service-role route. The service role
--     has BYPASSRLS, so the write needs no policy and no client grant, and
--     there is therefore NO anon insert path on this table at all -- narrower
--     than pass_leads, where 173 had to grant anon INSERT because the pass form
--     posts before anyone is signed in.
--   * The only reader is the admin Origen tab, through
--     /api/admin/data?tab=origen behind requireApiAdmin(), which is the path
--     lib/dal/adminLeads.ts already uses and the same is_app_admin() gate the
--     panel itself applies.
--
-- An admin SELECT policy would be dead code: `authenticated` is not granted
-- SELECT on the table, so no policy could be reached from a browser client
-- anyway. 210's av_notification_log is the precedent for this exact shape.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT admin_attribution_summary RETURNS, AND THE TWO COLUMNS IT DOES NOT
-- ════════════════════════════════════════════════════════════════════════════
--
-- One row per distinct (src, code, utm_campaign, attr_ref) tuple, with visits,
-- leads, contacted and attended. The Origen tab's "group by" toggle re-groups
-- those rows in the client, which is correct because every lead and every event
-- belongs to exactly one tuple, so the counts sum.
--
-- IT DOES NOT RETURN signups OR bookings, which the spec's part F asks for.
-- Attributing a signup needs the users columns in spec part C, and part C is
-- blocked on policy v1.1. Returning those columns as zeros would be worse than
-- omitting them: a zero in a column headed "signups" is a measurement, and it
-- would be read as "this channel sent nobody who joined" when the truth is
-- "nothing records that yet". CLAUDE.md, on fabricated causes being more
-- durable than absent ones. They are added when part C ships, by a migration
-- that can fill them.
--
-- PostgREST on this project has AGGREGATES DISABLED (select=count() returns
-- PGRST123, documented in lib/dal/adminLeads.ts and fetchGymsAndStudios), so
-- the grouping cannot happen over the wire and has to be a database object.
--
-- SECURITY INVOKER, deliberately. Every other admin read in this panel runs as
-- the service role behind requireApiAdmin(), and the service role already holds
-- what this needs. A SECURITY DEFINER function here would be a second,
-- permanently privileged path to the same rows, with its own authorisation to
-- get right, for no capability the caller does not already have.

BEGIN;

-- ── 1. The log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attribution_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  event_type   text NOT NULL,
  session_key  text NOT NULL,
  src          text,
  code         text,
  attr_ref     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  landing_path text
);

COMMENT ON TABLE public.attribution_events IS
  'T-GROW1 part D. One row per tagged visit (and per share click), written only by '
  'POST /api/attr with the service role. Read only by the admin Origen tab through '
  '/api/admin/data behind requireApiAdmin(). Holds NO user id, NO ip and NO user '
  'agent: a row is a tagged visit and is deliberately not a person. Linking a visit '
  'to an account is the purpose the published data policy v1.0 does not cover, and '
  'waits for v1.1 with T-GROW1 part C.';
COMMENT ON COLUMN public.attribution_events.session_key IS
  'An opaque random key the client holds in sessionStorage, for deduplication only. '
  'Generated with no reference to any account and dies with the tab. Not an '
  'identifier and must not be joined to one.';

-- Same vocabulary the capture library and /api/attr accept. Named so a violation
-- says which value was wrong.
ALTER TABLE public.attribution_events DROP CONSTRAINT IF EXISTS attribution_events_event_type_check;
ALTER TABLE public.attribution_events
  ADD CONSTRAINT attribution_events_event_type_check
  CHECK (event_type IN ('visit', 'pass_view', 'share_click'));

-- Size bounds only, and the same 40 as 211, for the same reason: the route
-- nulls anything longer, so these two numbers are one number. Shape stays in the
-- route where a violation drops a field instead of rejecting the row.
ALTER TABLE public.attribution_events DROP CONSTRAINT IF EXISTS attribution_events_tag_bounds;
ALTER TABLE public.attribution_events
  ADD CONSTRAINT attribution_events_tag_bounds
  CHECK (
        (src          IS NULL OR char_length(src)          BETWEEN 1 AND 40)
    AND (code         IS NULL OR char_length(code)         BETWEEN 1 AND 40)
    AND (attr_ref     IS NULL OR char_length(attr_ref)     BETWEEN 1 AND 40)
    AND (utm_source   IS NULL OR char_length(utm_source)   BETWEEN 1 AND 40)
    AND (utm_medium   IS NULL OR char_length(utm_medium)   BETWEEN 1 AND 40)
    AND (utm_campaign IS NULL OR char_length(utm_campaign) BETWEEN 1 AND 40)
    AND (utm_content  IS NULL OR char_length(utm_content)  BETWEEN 1 AND 40)
    AND (landing_path IS NULL OR char_length(landing_path) BETWEEN 1 AND 200)
  );

-- The key's charset IS pinned, unlike the tags. A tag comes off a printed poster
-- and a typo must cost the field rather than the row; a session key is generated
-- by our own code three lines before it is sent, so a malformed one is a bug and
-- there is nothing to lose by refusing it.
ALTER TABLE public.attribution_events DROP CONSTRAINT IF EXISTS attribution_events_session_key_check;
ALTER TABLE public.attribution_events
  ADD CONSTRAINT attribution_events_session_key_check
  CHECK (session_key ~ '^[A-Za-z0-9_-]{8,64}$');

-- ── 2. Once per session for a visit, and only for a visit ───────────────────
CREATE UNIQUE INDEX IF NOT EXISTS attribution_events_one_visit_per_session
  ON public.attribution_events (session_key)
  WHERE event_type = 'visit';

-- The summary reads a date window across the whole table and this is the only
-- predicate it has. DESC to match 175's idx_pass_leads_created, so the two
-- halves of the Origen read scan the same direction.
CREATE INDEX IF NOT EXISTS attribution_events_created_idx
  ON public.attribution_events (created_at DESC);

-- ── 3. Closed to every client role ──────────────────────────────────────────
--
-- RLS on with zero policies denies every RLS-bound role. The service role has
-- BYPASSRLS and is the only writer and the only reader. See the header for why
-- an admin policy here would be unreachable dead code.
ALTER TABLE public.attribution_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attribution_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.attribution_events TO service_role;

-- ── 4. The Origen read ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_attribution_summary(p_since timestamptz)
RETURNS TABLE (
  src          text,
  code         text,
  utm_campaign text,
  attr_ref     text,
  visits       bigint,
  leads        bigint,
  contacted    bigint,
  attended     bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $fn$
  WITH
  -- p_since IS NULL is the "all time" option in the tab's range filter.
  --
  -- coalesce(p_since, '-infinity') AND NOT (p_since IS NULL OR created_at >=
  -- p_since). The two are logically identical and only one of them can use an
  -- index: an OR against a parameter forces a sequential scan in the generic
  -- plan, and this function has a SET clause so it is never inlined and the plan
  -- IS generic. attribution_events is the one table in this program that grows
  -- with traffic rather than with conversions, so it is the one place where that
  -- distinction will eventually be the difference between a tab that loads and a
  -- tab that does not. '-infinity' is a real timestamptz and sorts below every
  -- stored value, so the single predicate admits everything when nothing is
  -- passed.
  e AS (
    SELECT ae.src, ae.code, ae.utm_campaign, ae.attr_ref, count(*) AS visits
      FROM public.attribution_events ae
     WHERE ae.event_type = 'visit'
       AND ae.created_at >= coalesce(p_since, '-infinity'::timestamptz)
     GROUP BY 1, 2, 3, 4
  ),
  l AS (
    SELECT pl.src, pl.code, pl.utm_campaign, pl.attr_ref,
           count(*)                AS leads,
           count(pl.contacted_at)  AS contacted,
           count(pl.attended_at)   AS attended
      FROM public.pass_leads pl
     WHERE pl.created_at >= coalesce(p_since, '-infinity'::timestamptz)
     GROUP BY 1, 2, 3, 4
  ),
  -- UNION and not UNION ALL: this is the key set, and UNION treats two NULLs as
  -- the same key, which is what makes "no source at all" one row rather than
  -- one row per lead. 2 of the 3 live leads are exactly that row.
  k AS (
    SELECT e.src, e.code, e.utm_campaign, e.attr_ref FROM e
    UNION
    SELECT l.src, l.code, l.utm_campaign, l.attr_ref FROM l
  )
  SELECT k.src, k.code, k.utm_campaign, k.attr_ref,
         coalesce(e.visits, 0)    AS visits,
         coalesce(l.leads, 0)     AS leads,
         coalesce(l.contacted, 0) AS contacted,
         coalesce(l.attended, 0)  AS attended
    FROM k
    -- IS NOT DISTINCT FROM, NOT =, on every one of the eight join conditions.
    -- These four columns are nullable and MOST OF THEM ARE NULL TODAY. With `=`
    -- a NULL key joins to nothing, so the untagged row -- the single biggest row
    -- in this table, and the one the whole program is trying to shrink -- would
    -- silently report visits 0 and leads 0 while the UNION above still listed
    -- it. A funnel whose largest row reads zero on both sides is CLAUDE.md's
    -- three-valued-logic finding with a table around it.
    LEFT JOIN e ON e.src          IS NOT DISTINCT FROM k.src
               AND e.code         IS NOT DISTINCT FROM k.code
               AND e.utm_campaign IS NOT DISTINCT FROM k.utm_campaign
               AND e.attr_ref     IS NOT DISTINCT FROM k.attr_ref
    LEFT JOIN l ON l.src          IS NOT DISTINCT FROM k.src
               AND l.code         IS NOT DISTINCT FROM k.code
               AND l.utm_campaign IS NOT DISTINCT FROM k.utm_campaign
               AND l.attr_ref     IS NOT DISTINCT FROM k.attr_ref
   ORDER BY coalesce(l.leads, 0) DESC, coalesce(e.visits, 0) DESC;
$fn$;

COMMENT ON FUNCTION public.admin_attribution_summary(timestamptz) IS
  'T-GROW1 part F. One row per (src, code, utm_campaign, attr_ref) with visits, '
  'leads, contacted and attended, for the admin Origen tab. A database object '
  'rather than a PostgREST query because aggregates are disabled on this project '
  '(PGRST123). SECURITY INVOKER: the only caller is the service role behind '
  'requireApiAdmin(), which already holds these reads, so a definer would be a '
  'second privileged path for no new capability. Returns NO signups or bookings '
  'column: attributing those needs T-GROW1 part C, which is blocked on data '
  'policy v1.1, and a zero in such a column would read as a measurement.';

REVOKE ALL ON FUNCTION public.admin_attribution_summary(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_summary(timestamptz) TO service_role;

-- ── 5. Assert the end state, after the writes ───────────────────────────────
DO $$
DECLARE
  v_priv text;
  v_n    int;
  v_rows int;
BEGIN
  IF to_regclass('public.attribution_events') IS NULL THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events was not created.';
  END IF;

  -- RLS on. Without it the zero-policy state means the opposite of what it
  -- means with it: no policies and no RLS is an open table.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.attribution_events')) THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events does not have RLS enabled.';
  END IF;

  -- Zero policies is the intended state and is asserted rather than assumed, so
  -- a later migration adding one has to come past this line and explain itself.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'attribution_events';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events has % policies, expected 0 -- '
                    'every read and write goes through the service role', v_n;
  END IF;

  -- No client role touches it at all. has_ANY_column_privilege, because the
  -- table-level form is false while a role holds the privilege on one column
  -- (CLAUDE.md, measured on production for pass_leads).
  FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
    IF has_any_column_privilege('anon', 'public.attribution_events', v_priv)
       OR has_any_column_privilege('authenticated', 'public.attribution_events', v_priv) THEN
      RAISE EXCEPTION '213 ABORTED: a client role holds % on attribution_events.', v_priv;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.attribution_events', 'DELETE')
     OR has_table_privilege('authenticated', 'public.attribution_events', 'DELETE') THEN
    RAISE EXCEPTION '213 ABORTED: a client role can DELETE from attribution_events.';
  END IF;

  -- The service role is the only writer, so losing its grant is a silent
  -- outage: /api/attr would 500 on every visit and nothing else would notice.
  IF NOT has_table_privilege('service_role', 'public.attribution_events', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.attribution_events', 'SELECT') THEN
    RAISE EXCEPTION '213 ABORTED: service_role cannot write or read attribution_events.';
  END IF;

  -- The partial unique index, and the fact that it IS partial. A plain unique
  -- index on session_key would admit one event per session of ANY type, so a
  -- share click would collide with the visit that preceded it and be lost.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'attribution_events'
       AND indexname = 'attribution_events_one_visit_per_session'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%WHERE (event_type = ''visit''::text)%'
  ) THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events_one_visit_per_session is missing, not '
                    'unique, or not restricted to visit rows (which would swallow share clicks).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                  AND tablename = 'attribution_events' AND indexname = 'attribution_events_created_idx') THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events_created_idx is missing.';
  END IF;

  IF to_regprocedure('public.admin_attribution_summary(timestamptz)') IS NULL THEN
    RAISE EXCEPTION '213 ABORTED: admin_attribution_summary is missing -- the Origen tab has no read.';
  END IF;

  IF has_function_privilege('anon', 'public.admin_attribution_summary(timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_attribution_summary(timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION '213 ABORTED: a client role can EXECUTE admin_attribution_summary -- every '
                    'lead count in the app would be readable from the browser bundle.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.admin_attribution_summary(timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION '213 ABORTED: service_role cannot EXECUTE admin_attribution_summary.';
  END IF;

  -- NOT SECURITY DEFINER, asserted because the usual mistake in this repo is the
  -- other direction and nothing else would say which one this is.
  IF (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.admin_attribution_summary(timestamptz)'::regprocedure) THEN
    RAISE EXCEPTION '213 ABORTED: admin_attribution_summary is SECURITY DEFINER -- it is meant to '
                    'run as the service role that already holds these reads.';
  END IF;

  -- THE READ ACTUALLY RUNS AND RETURNS THE LIVE ROWS.
  --
  -- Every assertion above is about the catalog. A function can satisfy all of
  -- them and still return nothing, which on a table that is legitimately empty
  -- is indistinguishable from working. So this calls it over all time and
  -- requires it to account for EVERY lead in pass_leads: sum(leads) must equal
  -- the row count. That is the one arm that cannot pass if the IS NOT DISTINCT
  -- FROM joins are wrong, because the untagged rows would drop out of the sum
  -- while still being counted by the table.
  SELECT coalesce(sum(s.leads), 0) INTO v_n FROM public.admin_attribution_summary(NULL) s;
  SELECT count(*) INTO v_rows FROM public.pass_leads;
  IF v_n <> v_rows THEN
    RAISE EXCEPTION '213 ABORTED: admin_attribution_summary accounts for % leads but pass_leads has % '
                    '-- a NULL key is dropping out, so the join is = rather than IS NOT DISTINCT FROM', v_n, v_rows;
  END IF;

  RAISE NOTICE '213: attribution_events created and closed to clients; summary accounts for all % leads.', v_rows;
END $$;

-- ── Record this migration as applied ────────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('213_t_grow1_attribution_events',
        'T-GROW1: attribution_events (RLS on, zero policies, service role only), once-per-session visit index, admin_attribution_summary')
ON CONFLICT (migration) DO NOTHING;

COMMIT;
