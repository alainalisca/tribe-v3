-- 175_t_lead2_lead_contact_toggle.sql
--
-- T-LEAD2, the data half. Two things: the one index the unfiltered admin list
-- needs, and the only write either leads view is allowed to make.
--
-- Numbered against origin/main re-read at the moment of writing (highest: 174,
-- 174_reviews_self_review_policy). 172 collided once already because two
-- sessions each inferred a number from their own branch rather than from main.
--
-- WHAT THIS DOES NOT DO, because 173 already did it:
--   * the (partner_id, created_at DESC) index -- exists as idx_pass_leads_partner_created
--   * the partial uncontacted index          -- exists as idx_pass_leads_uncontacted
--   * an admin SELECT policy                 -- exists as "Admins manage pass leads"
--   * a partner SELECT policy                -- exists as "Partner reads own leads"
-- Measured on production before writing, not inferred from the migration files.
-- NO POLICY IS ADDED OR CHANGED HERE. The guard at the bottom asserts the count
-- is still 3.

-- ── The missing index ─────────────────────────────────────────────────────
--
-- 173 indexed (partner_id, created_at DESC) because everything it anticipated
-- was per-partner: the digest and the partner dashboard. The admin view asks a
-- question neither of those does -- every lead, newest first, across all
-- partners -- and a leading partner_id cannot serve an ordering that does not
-- filter on it.
--
-- Also the driver for two of the three tiles (totales, ultimos 7 dias), which
-- count without a partner predicate whenever the filter is on Todos.
CREATE INDEX IF NOT EXISTS idx_pass_leads_created
  ON public.pass_leads (created_at DESC);

-- ── The Contactado toggle ─────────────────────────────────────────────────
--
-- 173 said this would be a SECURITY DEFINER function when it shipped, and gave
-- the reason: a policy grants the WHOLE ROW, and an UPDATE policy's WITH CHECK
-- cannot see the OLD row, so an owner UPDATE policy here would let a partner
-- rewrite a lead's email and phone number. That is migration 018's mistake on
-- this table family, which 104 had to undo.
--
-- THERE IS ALSO NO OTHER OPTION, which is worth stating because it is easy to
-- reach for the panel's usual pattern and find it silently impossible.
-- Measured with has_column_privilege on production: `authenticated` holds
-- SELECT on all 19 columns of pass_leads and UPDATE on NONE. So the existing
-- "Admins manage pass leads" policy (FOR ALL, is_app_admin()) is unreachable
-- for writes from any browser client -- an admin gets 42501 on a direct
-- update, and so does a partner. The grants are narrower than the policies,
-- deliberately (173 narrowed them), and this function is the doorway.
--
-- ONE FUNCTION, TWO AUDIENCES. The admin Leads tab and the partner dashboard
-- both call this. Splitting them would mean two places where the writable
-- surface could widen independently.
--
-- THE WRITABLE SURFACE IS ONE COLUMN BY CONSTRUCTION. Not "by policy", which
-- someone can widen with an ALTER; the function names contacted_at and there is
-- nowhere else for a value to go.
CREATE OR REPLACE FUNCTION public.set_pass_lead_contacted(p_lead_id uuid, p_contacted boolean)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_partner_id uuid;
  v_found      boolean;
  v_result     timestamptz;
BEGIN
  -- SECURITY DEFINER runs as the owner, so nothing below is protected by RLS.
  -- Every check has to be made here, explicitly, starting with whether there is
  -- a caller at all. auth.uid() reads the JWT claim and is unaffected by the
  -- role switch.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_pass_lead_contacted: no authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.partner_id, true INTO v_partner_id, v_found
  FROM public.pass_leads l
  WHERE l.id = p_lead_id;

  -- A missing lead is told apart from a forbidden one only in the error code;
  -- both are dead ends for the caller. They are separate branches because
  -- collapsing them would make "you may not" and "it is gone" the same answer,
  -- and the UI would report the wrong thing for one of them.
  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION 'set_pass_lead_contacted: lead % does not exist', p_lead_id
      USING ERRCODE = 'P0002';
  END IF;

  -- An admin, or the partner whose lead it is. v_partner_id IS NULL when the
  -- partner row was deleted (partner_id is ON DELETE SET NULL), and the EXISTS
  -- is then false for everyone: an orphaned lead is admin-only, which is right.
  -- It is still a real person who left a phone number, so it stays readable and
  -- workable rather than being hidden.
  IF NOT (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.featured_partners fp
      WHERE fp.id = v_partner_id
        AND fp.user_id = auth.uid()
    )
  ) THEN
    -- RAISES RATHER THAN UPDATING ZERO ROWS. A no-op would return successfully
    -- and the toggle would flip back on the next reload with no error shown,
    -- which reads as a flaky product rather than as a refusal.
    RAISE EXCEPTION 'set_pass_lead_contacted: caller may not modify lead %', p_lead_id
      USING ERRCODE = '42501';
  END IF;

  -- coalesce, not a bare now(): marking an already-contacted lead again must
  -- not move the timestamp. "When was this person contacted" is the useful
  -- record, and a double tap should not rewrite it.
  UPDATE public.pass_leads
     SET contacted_at = CASE WHEN p_contacted THEN coalesce(contacted_at, now()) ELSE NULL END
   WHERE id = p_lead_id
  RETURNING contacted_at INTO v_result;

  -- The caller renders THIS, not the value it asked for, so the UI can never
  -- drift from the row.
  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.set_pass_lead_contacted(uuid, boolean) IS
  'The only write either leads view may make. SECURITY DEFINER because '
  'authenticated holds no UPDATE privilege on pass_leads at all, so the admin '
  'policy is unreachable from a browser client. Serves the admin tab and the '
  'partner dashboard from one implementation; the writable surface is '
  'contacted_at by construction rather than by policy. Raises 42501 for a '
  'caller who is neither an admin nor the lead''s partner, rather than '
  'updating zero rows.';

-- Default privileges grant EXECUTE on a new function to PUBLIC, which includes
-- anon -- the key that ships in the client bundle. Revoke first, then grant the
-- one role that may call it. anon is deliberately absent: a stranger filing a
-- lead has no business marking one contacted.
REVOKE ALL ON FUNCTION public.set_pass_lead_contacted(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pass_lead_contacted(uuid, boolean) TO authenticated;

-- ── Guards ────────────────────────────────────────────────────────────────
--
-- Each of these was proved to fire by reintroducing the mistake it names and
-- watching it raise; a guard that has only ever been observed staying quiet has
-- not been shown to do anything.
DO $$
DECLARE
  n_pol   int;
  setters text;
BEGIN
  IF to_regclass('public.pass_leads') IS NULL THEN
    RAISE EXCEPTION '175 guard: pass_leads does not exist -- 173 has not been applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pass_leads' AND indexname = 'idx_pass_leads_created'
  ) THEN
    RAISE EXCEPTION '175 guard: idx_pass_leads_created is missing';
  END IF;

  IF to_regprocedure('public.set_pass_lead_contacted(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION '175 guard: set_pass_lead_contacted() is missing -- neither '
                    'leads view can mark anything contacted';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure) THEN
    RAISE EXCEPTION '175 guard: set_pass_lead_contacted() is not SECURITY DEFINER -- '
                    'it would run as the caller, who holds no UPDATE on pass_leads, '
                    'and every toggle would fail with 42501';
  END IF;

  -- An unpinned search_path in a SECURITY DEFINER function is the classic
  -- privilege-escalation hole: the caller chooses which schema `pass_leads`
  -- resolves to.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure
      AND proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search\_path=%')
  ) THEN
    RAISE EXCEPTION '175 guard: set_pass_lead_contacted() has no pinned search_path';
  END IF;

  IF has_function_privilege('anon', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '175 guard: anon can EXECUTE set_pass_lead_contacted() -- the key '
                    'in the client bundle could mark any lead contacted';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '175 guard: authenticated cannot EXECUTE set_pass_lead_contacted() -- '
                    'the toggle is dead for admins and partners alike';
  END IF;

  -- THE POINT OF THE WHOLE DESIGN: the function is the doorway BECAUSE the
  -- table has no other one. If a later migration grants UPDATE to a client
  -- role, the single-column guarantee is gone and nothing else would say so.
  IF has_table_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_table_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '175 guard: a client role holds UPDATE on pass_leads -- the '
                    'single-column write surface is no longer guaranteed';
  END IF;

  -- No policy was added or changed here. 173 left three; three is still right.
  SELECT count(*) INTO n_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads';
  IF n_pol <> 3 THEN
    RAISE EXCEPTION '175 guard: pass_leads has % policies, expected 3 -- 175 adds none', n_pol;
  END IF;

  -- EVERY assignment target in the UPDATE's SET clause, not just the first.
  --
  -- The first version of this guard matched '\mSET\s+([a-z_]+)\s*=' and was
  -- proved useless by its own counter-rehearsal: adding a SECOND column on the
  -- next line ("SET contacted_at = ..., notified_at = now()") left the guard
  -- green, because only the first target follows the word SET. It could see the
  -- shape it was built for and nothing else -- which is the entire failure this
  -- guard exists to catch, wearing the guard's own clothes.
  --
  -- So: take the whole clause between SET and WHERE and read every target in
  -- it. Line comments are stripped first, because a guard that matches prose
  -- inside the body it is reading is migration 165's finding repeated.
  --
  -- The limits are real and worth stating: this reads the text of one function
  -- rather than asking the database what the function can do, and Postgres
  -- offers no capability form of the question. The rehearsal's Part D does ask
  -- the capability question -- it diffs the whole row before and after a real
  -- call -- and that is the stronger proof. This is the cheap always-on version.
  SELECT string_agg(DISTINCT m[1], ', ' ORDER BY m[1]) INTO setters
  FROM pg_proc p,
       LATERAL (SELECT regexp_replace(p.prosrc, '--[^\n]*', '', 'g') AS body) b,
       LATERAL (SELECT (regexp_match(b.body, '\mSET\s+((?:.|\n)*?)\mWHERE\M'))[1] AS set_clause) c,
       LATERAL regexp_matches(c.set_clause, '([a-z_]+)\s*=', 'g') AS m
  WHERE p.oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure;
  IF setters IS DISTINCT FROM 'contacted_at' THEN
    RAISE EXCEPTION '175 guard: the UPDATE assigns to [%], expected contacted_at alone', setters;
  END IF;
END $$;
