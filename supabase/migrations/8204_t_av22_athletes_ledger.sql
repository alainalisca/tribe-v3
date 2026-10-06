-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV22
-- CREATES: av_athletes_ledger(uuid), av_athletes_ledger_totals(uuid)
-- RISK: MEDIUM
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV22 (4 of 5): the one ledger
-- ════════════════════════════════════════════════════════════════════════════
--
-- 8204 was free on origin/main (highest 198), every branch, every worktree and
-- all history on 2026-09-29.
--
-- EVERY SUMMARY READS THIS, so an athlete and their gym cannot see different
-- numbers. av_athletes_ledger returns one row per ATTRIBUTED lead of the
-- partner; av_athletes_ledger_totals is a GROUP BY over it and nothing else,
-- so no count is computed in two places.
--
-- THE RULES (approved 2026-09-29), per attributed lead, first match wins:
--   self_email      lower(lead email) = the athlete's email_lower
--   self_whatsapp   lead WhatsApp = the athlete's whatsapp_e164 (both E.164)
--   already_member  the coach marked outcome already_member
--   returning       an EARLIER lead of the same partner, attributed or not,
--                   with attended_at set, matches by lower(email) or WhatsApp.
--                   Earlier = created_at, ties broken by id.
--   duplicate       among the athlete's leads that passed the four checks
--                   above, the same guest (lower(email) or WhatsApp) is
--                   credited once: the attended lead if any, else the
--                   earliest. The others are duplicate. (Decision 7.)
--   Credited        none of the above.
--   Showed up       credited and attended_at set.
--   Joined          showed up and outcome joined. A captain's join counts.
--   Retained        joined and retained_at set.
--   Bonus owed      joined AND bonus_eligible AND not settled (decision 2).
--   Bonus settled   joined AND bonus_eligible AND settled.
--   Per athlete, every count is over CREDITED leads (rule 3: "the counts
--   ignore it"); not_credited counts the rest. ready_to_promote = level
--   captain AND credited show-ups >= promote_at_showups.
--
-- The duplicate rule is pairwise: a lead is a duplicate when another
-- candidate of the same athlete matching it ranks ahead of it. For a chain
-- A~B~C where A and C share nothing, C can be a duplicate of a B that is not
-- itself credited. Accepted as an edge case: it needs one guest to have used
-- two emails and two phones across three claims through one athlete.
--
-- SECURITY INVOKER AND NOT EXECUTABLE BY ANY CLIENT ROLE. Called only from the
-- definer functions in 8205 and 8206, which run as the owner. Invoker means a grant
-- added by mistake later cannot turn this into a read of every lead.

BEGIN;

CREATE OR REPLACE FUNCTION public.av_athletes_ledger(p_partner_id uuid)
RETURNS TABLE (
  lead_id            uuid,
  program_athlete_id uuid,
  guest_first_name   text,
  pass_code          text,
  claimed_at         timestamptz,
  attended_at        timestamptz,
  outcome            text,
  outcome_at         timestamptz,
  retained_at        timestamptz,
  bonus_eligible     boolean,
  bonus_settled_at   timestamptz,
  credited           boolean,
  no_credit_reason   text,
  showed_up          boolean,
  joined             boolean,
  retained           boolean,
  bonus_owed         boolean,
  bonus_settled      boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  WITH attributed AS (
    SELECT pl.id, pl.created_at, lower(pl.email) AS email_l, pl.whatsapp, pl.name, pl.pass_code,
           pl.attended_at, pl.outcome, pl.outcome_at, pl.retained_at,
           pl.bonus_eligible, pl.bonus_settled_at,
           pa.id AS pa_id, pa.email_lower, pa.whatsapp_e164
      FROM public.pass_leads pl
      JOIN public.program_athletes pa
        ON pa.id = pl.referred_by_athlete_id AND pa.partner_id = pl.partner_id
     WHERE pl.partner_id = p_partner_id
  ),
  reasoned AS (
    SELECT a.*,
      CASE
        WHEN a.email_l = a.email_lower THEN 'self_email'
        WHEN a.whatsapp_e164 IS NOT NULL AND a.whatsapp = a.whatsapp_e164 THEN 'self_whatsapp'
        WHEN a.outcome = 'already_member' THEN 'already_member'
        WHEN EXISTS (SELECT 1 FROM public.pass_leads e
                      WHERE e.partner_id = p_partner_id
                        AND e.id <> a.id
                        AND e.attended_at IS NOT NULL
                        AND (e.created_at < a.created_at OR (e.created_at = a.created_at AND e.id < a.id))
                        AND (lower(e.email) = a.email_l OR e.whatsapp = a.whatsapp)) THEN 'returning'
      END AS pre_reason
      FROM attributed a
  ),
  final AS (
    SELECT r.*,
      CASE
        WHEN r.pre_reason IS NOT NULL THEN r.pre_reason
        WHEN EXISTS (SELECT 1 FROM reasoned o
                      WHERE o.pa_id = r.pa_id
                        AND o.id <> r.id
                        AND o.pre_reason IS NULL
                        AND (o.email_l = r.email_l OR o.whatsapp = r.whatsapp)
                        AND (   (o.attended_at IS NOT NULL AND r.attended_at IS NULL)
                             OR ((o.attended_at IS NULL) = (r.attended_at IS NULL)
                                 AND (o.created_at < r.created_at
                                      OR (o.created_at = r.created_at AND o.id < r.id))))) THEN 'duplicate'
      END AS reason
      FROM reasoned r
  )
  SELECT f.id,
         f.pa_id,
         split_part(btrim(f.name), ' ', 1),
         f.pass_code,
         f.created_at,
         f.attended_at,
         f.outcome,
         f.outcome_at,
         f.retained_at,
         f.bonus_eligible,
         f.bonus_settled_at,
         f.reason IS NULL,
         f.reason,
         f.reason IS NULL AND f.attended_at IS NOT NULL,
         f.reason IS NULL AND f.attended_at IS NOT NULL AND f.outcome = 'joined',
         f.reason IS NULL AND f.attended_at IS NOT NULL AND f.outcome = 'joined' AND f.retained_at IS NOT NULL,
         f.reason IS NULL AND f.attended_at IS NOT NULL AND f.outcome = 'joined' AND f.bonus_eligible IS TRUE AND f.bonus_settled_at IS NULL,
         f.reason IS NULL AND f.attended_at IS NOT NULL AND f.outcome = 'joined' AND f.bonus_eligible IS TRUE AND f.bonus_settled_at IS NOT NULL
    FROM final f;
$fn$;

CREATE OR REPLACE FUNCTION public.av_athletes_ledger_totals(p_partner_id uuid)
RETURNS TABLE (
  program_athlete_id uuid,
  user_id            uuid,
  level              text,
  status             text,
  invited            integer,
  not_credited       integer,
  showed_up          integer,
  joined             integer,
  retained           integer,
  bonus_owed         integer,
  bonus_settled      integer,
  promote_at_showups integer,
  ready_to_promote   boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT pa.id,
         pa.user_id,
         pa.level,
         pa.status,
         (count(*) FILTER (WHERE l.credited))::int,
         (count(*) FILTER (WHERE NOT l.credited))::int,
         (count(*) FILTER (WHERE l.showed_up))::int,
         (count(*) FILTER (WHERE l.joined))::int,
         (count(*) FILTER (WHERE l.retained))::int,
         (count(*) FILTER (WHERE l.bonus_owed))::int,
         (count(*) FILTER (WHERE l.bonus_settled))::int,
         ap.promote_at_showups,
         pa.level = 'captain' AND count(*) FILTER (WHERE l.showed_up) >= ap.promote_at_showups
    FROM public.program_athletes pa
    JOIN public.athlete_programs ap ON ap.partner_id = pa.partner_id
    LEFT JOIN public.av_athletes_ledger(p_partner_id) l ON l.program_athlete_id = pa.id
   WHERE pa.partner_id = p_partner_id
   GROUP BY pa.id, pa.user_id, pa.level, pa.status, ap.promote_at_showups;
$fn$;

REVOKE ALL ON FUNCTION public.av_athletes_ledger(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.av_athletes_ledger_totals(uuid) FROM public, anon, authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.av_athletes_ledger(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.av_athletes_ledger(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.av_athletes_ledger_totals(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.av_athletes_ledger_totals(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '8204 ABORTED: a client role can execute the ledger.';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.av_athletes_ledger(uuid)'::regprocedure)
     OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.av_athletes_ledger_totals(uuid)'::regprocedure) THEN
    RAISE EXCEPTION '8204 ABORTED: the ledger must be SECURITY INVOKER.';
  END IF;
  RAISE NOTICE '8204: one ledger installed, callable only from definer functions.';
END $$;

COMMIT;
