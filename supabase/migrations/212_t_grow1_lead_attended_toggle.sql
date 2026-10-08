-- PROGRAM: T-GROW Growth Engine
-- TICKET: T-GROW1 part E
-- TABLE: public.pass_leads OWNER: consumer
-- CREATES: function public.set_pass_lead_attended(uuid, boolean)
-- ALTERS: nothing. No column, no policy, no grant on any table.
-- RISK: MEDIUM
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-GROW1 (2 of 3): the "Asistio" toggle for the two leads views
-- ════════════════════════════════════════════════════════════════════════════
--
-- 212 was free on origin/main (highest 210, 549a8fe4), every branch, every
-- worktree and all history, re-read 2026-10-08 at the moment of writing.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES NOT ADD, AND WHY THE SPEC SAID IT WOULD
-- ════════════════════════════════════════════════════════════════════════════
--
-- T-GROW1 part E asks for "attended_at timestamptz on pass_leads". IT IS
-- ALREADY THERE. Migration 201 (T-AV21) added attended_at,
-- attended_marked_by and attended_method on 2026-09-29, with a CHECK admitting
-- exactly 'toggle', 'scan' and 'code' -- 'toggle' being this screen, named
-- before it existed.
--
-- The T-GROW0 recon report listed pass_leads' columns from migration 173 and
-- did not mention 201 or 204, so the program spec was written against a table
-- that had moved. This is worth recording rather than quietly skipping the
-- column: a migration that ADD COLUMN IF NOT EXISTS over an existing column is
-- a silent no-op, so writing the spec's version of part E would have produced a
-- file that looked like it did something and did nothing, and the next reader
-- would have had two files claiming to own the same column.
--
-- So part E reduces to the ONE thing that is genuinely missing: a write path
-- the leads lists can use.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY A SECOND WRITER TO attended_at, WHEN ONE ALREADY EXISTS
-- ════════════════════════════════════════════════════════════════════════════
--
-- 201 shipped av_confirm_pass_attendance(pass_code, method): the DOOR's write.
-- It is keyed on the pass code a guest shows on their phone, it is deliberately
-- set-only and idempotent ("the first confirmation stands"), and it answers
-- {success:false, error:'not_found'} for a missing code and a forbidden one
-- alike, so the door cannot be used to learn which codes exist.
--
-- Every one of those properties is right for a door and wrong for a toggle:
--
--   * SET-ONLY IS THE BLOCKER. A switch that cannot go back makes a mis-tap
--     permanent, so the attended tile can only ever count up and nobody can fix
--     a row. That is 175's B2 reasoning for Contactado, and it applies
--     identically here.
--   * The leads table holds the lead id; routing a list action through a pass
--     code would make the write depend on a column that exists for a different
--     purpose.
--   * One collapsed refusal is right at a door and wrong in an admin panel,
--     where "this row is gone" and "you may not touch this row" need different
--     words on screen.
--   * An ORPHANED lead (partner_id is ON DELETE SET NULL) is unreachable
--     through the door for everyone, admin included, because av_can_work_door
--     requires a partner id. It is still a real person who left a phone number,
--     and 175 settled that an admin keeps working it.
--
-- WHAT IS NOT DUPLICATED IS THE AUTHORISATION RULE. This function calls
-- av_can_work_door, so "who may mark attendance for this partner" stays in the
-- single place 201 put it: the owner of the featured_partners row, an ACTIVE
-- coach of it (is_active IS TRUE, so FALSE and NULL are both refused), or an
-- app admin. Adding is_app_admin() alongside it is not a second rule, it is the
-- orphan case above: av_can_work_door short-circuits on a NULL partner id
-- before it ever reaches its own admin branch.
--
-- The application side keeps the same discipline: exactly one DAL module may
-- call this RPC, asserted by lib/dal/leadAttendance.singleWriter.test.ts, which
-- is the shape lib/dal/leadContact.singleWriter.test.ts already uses for
-- Contactado.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY SECURITY DEFINER, WHICH IS NOT A STYLE CHOICE HERE
-- ════════════════════════════════════════════════════════════════════════════
--
-- 173 granted SELECT and INSERT on pass_leads to client roles and UPDATE to
-- NOBODY (line 166 to 169: REVOKE ALL, then GRANT INSERT, then GRANT SELECT).
-- So "Admins manage pass leads" (FOR ALL, is_app_admin()) is unreachable for
-- writes from any browser client -- an admin gets 42501 on a direct update and
-- so does a partner. There is no policy that would fix that, because the
-- missing thing is a GRANT, and granting UPDATE is the thing 175's guard exists
-- to prevent. A definer function is the only doorway, and the writable surface
-- is three named columns BY CONSTRUCTION rather than by a policy anyone can
-- later widen.
--
-- THE THREE COLUMNS MOVE TOGETHER, which is the one way this differs from 175's
-- single column. Marking attendance without recording who marked it leaves a
-- row that cannot be explained later, and clearing attended_at while leaving
-- attended_marked_by set leaves a row that says nobody attended and someone
-- confirmed it. The guard below therefore asserts the SET clause names exactly
-- these three, in a form that cannot be satisfied by naming only one.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_pass_lead_attended(p_lead_id uuid, p_attended boolean)
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
  -- SECURITY DEFINER runs as the owner, so nothing below is protected by RLS
  -- and every check has to be made here. auth.uid() reads the JWT claim and is
  -- unaffected by the role switch.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_pass_lead_attended: no authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.partner_id, true INTO v_partner_id, v_found
  FROM public.pass_leads l
  WHERE l.id = p_lead_id;

  -- Gone and forbidden are different answers, told apart by error code, because
  -- the leads list has to say different things for them. Collapsing them is
  -- right at the door and wrong here.
  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION 'set_pass_lead_attended: lead % does not exist', p_lead_id
      USING ERRCODE = 'P0002';
  END IF;

  -- av_can_work_door is the single place the per-partner rule lives (201): the
  -- partner owner, an ACTIVE coach, or an admin. is_app_admin() is OR'd in front
  -- of it for one case it cannot reach: a lead whose partner row was deleted has
  -- a NULL partner_id, and av_can_work_door returns false for everyone on a NULL
  -- partner id, admin included, before it evaluates its own admin branch.
  IF NOT (public.is_app_admin() OR public.av_can_work_door(v_partner_id)) THEN
    -- Raises rather than updating zero rows. A no-op returns successfully and
    -- the switch flips back on the next reload with no error shown, which reads
    -- as a flaky product rather than as a refusal.
    RAISE EXCEPTION 'set_pass_lead_attended: caller may not modify lead %', p_lead_id
      USING ERRCODE = '42501';
  END IF;

  -- coalesce on all three, not a bare now(): re-marking an already-attended
  -- lead must not move the timestamp, must not reassign who confirmed it, and
  -- must not rewrite HOW it was confirmed. That last one is the reason this is
  -- not simply three copies of 175's line. If the door already confirmed this
  -- guest by scanning their QR, attended_method is 'scan', and that is a
  -- stronger record than a later tap on a list. The toggle never downgrades it.
  --
  -- Clearing nulls all three together. attended_at NULL beside a surviving
  -- attended_marked_by would be a row saying nobody came and somebody saw them.
  UPDATE public.pass_leads
     SET attended_at        = CASE WHEN p_attended THEN coalesce(attended_at, now()) ELSE NULL END,
         attended_marked_by = CASE WHEN p_attended THEN coalesce(attended_marked_by, auth.uid()) ELSE NULL END,
         attended_method    = CASE WHEN p_attended THEN coalesce(attended_method, 'toggle') ELSE NULL END
   WHERE id = p_lead_id
  RETURNING attended_at INTO v_result;

  -- The caller renders THIS, not the value it asked for, so the UI can never
  -- drift from the row.
  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.set_pass_lead_attended(uuid, boolean) IS
  'The "Asistio" toggle for the admin Leads tab and the partner Leads section '
  '(T-GROW1 part E). SECURITY DEFINER because authenticated holds no UPDATE '
  'privilege on pass_leads at all, so the admin policy is unreachable from a '
  'browser client. Writes attended_at, attended_marked_by and attended_method '
  'and nothing else, by construction. Distinct from av_confirm_pass_attendance '
  '(201), which is the door''s set-only write keyed on the pass code; this one '
  'can also CLEAR, so a mis-tap is reversible. Both authorise through '
  'av_can_work_door, so the per-partner rule is not duplicated. Raises 42501 '
  'for a caller who may not work this partner''s door and P0002 for a lead that '
  'does not exist, rather than updating zero rows.';

-- Default privileges grant EXECUTE on a new function to PUBLIC, which includes
-- anon -- the key that ships in the client bundle. Revoke first, then grant the
-- one role that may call it. anon is deliberately absent: a stranger claiming a
-- pass has no business marking one attended.
REVOKE ALL ON FUNCTION public.set_pass_lead_attended(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pass_lead_attended(uuid, boolean) TO authenticated;

-- ── Guards ──────────────────────────────────────────────────────────────────
--
-- Every one of these is proved to FIRE by an arm in the rehearsal that
-- reintroduces the mistake it names. A guard only ever observed staying quiet
-- has not been shown to do anything.
DO $$
DECLARE
  setters text;
  n_cols  int;
BEGIN
  -- The dependency, not the thing being built: without 201 this file compiles a
  -- function whose first authorisation call does not resolve.
  IF to_regprocedure('public.av_can_work_door(uuid)') IS NULL THEN
    RAISE EXCEPTION '212 guard: av_can_work_door() is missing -- 201 has not been applied, '
                    'so set_pass_lead_attended has no authorisation rule to call';
  END IF;

  SELECT count(*) INTO n_cols FROM pg_attribute
   WHERE attrelid = 'public.pass_leads'::regclass
     AND attname IN ('attended_at', 'attended_marked_by', 'attended_method')
     AND attnum > 0 AND NOT attisdropped;
  IF n_cols <> 3 THEN
    RAISE EXCEPTION '212 guard: pass_leads has % of the three attendance columns, expected 3 -- '
                    '201 has not been applied', n_cols;
  END IF;

  IF to_regprocedure('public.set_pass_lead_attended(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION '212 guard: set_pass_lead_attended() is missing -- neither leads view '
                    'can mark anything attended';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure) THEN
    RAISE EXCEPTION '212 guard: set_pass_lead_attended() is not SECURITY DEFINER -- it would '
                    'run as the caller, who holds no UPDATE on pass_leads, and every toggle '
                    'would fail with 42501';
  END IF;

  -- An unpinned search_path in a SECURITY DEFINER function is the classic
  -- privilege-escalation hole: the caller chooses which schema pass_leads
  -- resolves to.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure
      AND proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search\_path=%')
  ) THEN
    RAISE EXCEPTION '212 guard: set_pass_lead_attended() has no pinned search_path';
  END IF;

  IF has_function_privilege('anon', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '212 guard: anon can EXECUTE set_pass_lead_attended() -- the key in the '
                    'client bundle could mark any lead attended, and attendance is the number '
                    'a gym is going to be shown';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '212 guard: authenticated cannot EXECUTE set_pass_lead_attended() -- the '
                    'toggle is dead for admins and partners alike';
  END IF;

  -- THE POINT OF THE WHOLE DESIGN, copied from 175 because it is the same
  -- guarantee: the function is the doorway BECAUSE the table has no other one.
  -- has_ANY_column_privilege and not has_table_privilege -- the table-level form
  -- returns false while a role genuinely holds UPDATE on a single column, which
  -- 175's rehearsal arm D7a measured on production.
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '212 guard: a client role holds UPDATE on pass_leads -- the three-column '
                    'write surface is no longer guaranteed';
  END IF;

  -- EVERY assignment target in the UPDATE's SET clause, and EXACTLY the three.
  --
  -- 175's version of this guard was proved useless by its own rehearsal when it
  -- matched only the target immediately after the word SET, so it takes the
  -- whole clause between SET and WHERE and reads every target in it. Comments
  -- are stripped first: a guard that matches prose inside the body it is reading
  -- is migration 165's finding repeated, and this body's comments name all three
  -- columns while explaining them.
  --
  -- Sorted and compared as one string rather than checked for membership, so
  -- this fails on a FOURTH column as loudly as on a missing one. A membership
  -- test would pass a body that also wrote `email = ''`.
  --
  -- COLLATE "C" is not decoration. 175's version sorted one value so ordering
  -- could not matter; three values compared against a literal means the guard's
  -- verdict depends on how the database sorts underscores, and a glibc or ICU
  -- collation can treat punctuation as secondary. Byte order is the only
  -- ordering that is the same on this database, a local stack and a rebuild.
  --
  -- The dedupe is a subquery rather than string_agg(DISTINCT ...). Postgres
  -- requires an aggregate's ORDER BY expression to appear in its argument list
  -- when DISTINCT is used, so `string_agg(DISTINCT m[1], ', ' ORDER BY m[1]
  -- COLLATE "C")` is a syntax error rather than a sorted list -- which would
  -- have aborted the migration at this guard rather than failing it.
  SELECT string_agg(s.col, ', ' ORDER BY s.col COLLATE "C") INTO setters
  FROM (
    SELECT DISTINCT m[1] AS col
    FROM pg_proc p,
         LATERAL (SELECT regexp_replace(p.prosrc, '--[^\n]*', '', 'g') AS body) b,
         LATERAL (SELECT (regexp_match(b.body, '\mSET\s+((?:.|\n)*?)\mWHERE\M'))[1] AS set_clause) c,
         LATERAL regexp_matches(c.set_clause, '([a-z_]+)\s*=', 'g') AS m
    WHERE p.oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure
  ) s;

  -- ASSERT THE READ SUCCEEDED BEFORE ASSERTING WHAT IT FOUND. If the regexp
  -- above matched nothing -- a renamed clause, a reshaped body, a tokeniser
  -- change -- setters is NULL, and every property asserted about it below is a
  -- property of NULL rather than of this function. CLAUDE.md records the
  -- migration 180 version of exactly this: three independent-looking checks all
  -- reduced to `'' !~* '...'` and all passed over a function that returned
  -- distance_km. The comparison below would in fact catch NULL, since
  -- IS DISTINCT FROM is NULL-safe, but it would report it as "assigns to []",
  -- which reads as a function that writes nothing rather than as a guard that
  -- read nothing. Those need different fixes, so they get different messages.
  IF setters IS NULL THEN
    RAISE EXCEPTION '212 guard: could not read the UPDATE SET clause out of '
                    'set_pass_lead_attended at all -- the guard is broken, not the function';
  END IF;
  IF setters IS DISTINCT FROM 'attended_at, attended_marked_by, attended_method' THEN
    RAISE EXCEPTION '212 guard: the UPDATE assigns to [%], expected attended_at, attended_marked_by, attended_method', setters;
  END IF;

  -- No policy was added or changed. This file adds a function and nothing else,
  -- and that claim is cheap to assert -- but the expected TOTAL depends on 211,
  -- so 211 is named as a precondition rather than being assumed.
  --
  -- The first version of this guard asserted `= 5` with a comment saying "211
  -- left five". That is true in the apply order and it made 212 silently
  -- undeployable on its own: run against a database where 211 had not been
  -- pasted, it would abort with "pass_leads has 4 policies, expected 5", which
  -- names the symptom and not the cause, and the operator's next move would be
  -- to go looking for a missing policy rather than to apply 211. An ordering
  -- requirement that is real should say so in the error.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'pass_leads'
                    AND policyname = 'Attribution columns are server only') THEN
    RAISE EXCEPTION '212 guard: 211 has not been applied (the attribution policy is absent). '
                    'Apply 211_t_grow1_lead_attribution first; this file is 2 of 3 in T-GROW1 '
                    'and the three are applied in order.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads') <> 5 THEN
    RAISE EXCEPTION '212 guard: pass_leads has % policies, expected 5 -- 212 adds none',
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads');
  END IF;

  RAISE NOTICE '212: set_pass_lead_attended installed, three columns wide, authorised through av_can_work_door.';
END $$;

-- ── Record this migration as applied ────────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('212_t_grow1_lead_attended_toggle',
        'T-GROW1: set_pass_lead_attended, the reversible Asistio toggle for both leads views; no column added, 201 already had them')
ON CONFLICT (migration) DO NOTHING;

COMMIT;
