-- 231_t_plan1_coach_plans.sql
--
-- T-PLAN1: paid plans for coaches and gyms (Stripe Billing). Part A, the data.
-- NOT APPLIED when written (2026-10-23).
--
-- RENUMBERED FROM 219 (2026-10-23). Written on 2026-10-12 as 219 (PR #222),
-- never applied anywhere but the local stack. By the time it was ported to
-- main, 220-228 and 230 were applied and frozen, so a new 219 sat below the
-- frozen line and failed migrationImmutability.test.ts. Two changes from 219:
--   1. the number, everywhere (the record row, every ABORTED message);
--   2. sessions_public is rebuilt on 222's definition, which appended is_test
--      after 219 was written. 219 copied 158's, and CREATE OR REPLACE VIEW
--      cannot drop a column, so 219 would have failed on production. A
--      pre-flight now refuses any view that is not 222's (or this file's own,
--      on a re-run).
-- Everything else is 219's SQL unchanged.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IT ADDS
--
--   public.users.coach_plan                         text NOT NULL DEFAULT 'basico'
--       basico | pro | crecimiento | embajador. The ONE plan column any client
--       can read: it drives the public "Pro" / "Embajador" badge and the
--       "Coaches destacados" row.
--   public.users.coach_plan_status                  text, active | past_due | canceled
--   public.users.coach_plan_source                  text, stripe | comp
--   public.users.coach_plan_stripe_customer_id      text, UNIQUE when set
--   public.users.coach_plan_stripe_subscription_id  text
--   public.users.coach_plan_current_period_end      timestamptz
--   public.users.coach_plan_granted_by              uuid, the admin who comped it
--   public.users.coach_plan_granted_at              timestamptz
--
--   public.sessions_public.creator_coach_plan, appended as the LAST column.
--
-- Written only by the server with the service role: the Stripe webhook
-- (/api/payment/webhook/stripe/, coach-plan branch) and the admin comp route.
-- Nothing else writes these columns, and the guard below makes sure of it.
--
-- Separate from Tribe.OS on purpose. coach_plan_stripe_customer_id is its own
-- column and never tribe_os_stripe_customer_id: the existing Tribe.OS
-- subscription handlers find their user by that column alone, so a shared
-- customer would let a coach-plan cancel clear a coach's Tribe.OS tier and gym
-- (Step 0 report, 2026-10-12). No tribe_os_* column is read or written here.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A TRIGGER
--
-- Same premise as 214, measured there on production 2026-10-09:
-- authenticated holds a TABLE-LEVEL UPDATE and INSERT on public.users, so every
-- new column is writable by its owner through users_update_own_profile the
-- moment it exists, and a column-level REVOKE cannot remove a table-level grant
-- (CLAUDE.md, the 093 entry). Without a guard any coach could make themselves
-- Pro from the browser console. The rehearsal's Part E measures exactly that.
--
-- Like 214 and unlike the is_admin / banned guards, it does NOT exempt admins.
-- An admin comps a plan through the admin route, which writes with the service
-- role and records coach_plan_granted_by. A second, client-side admin writer
-- would leave rows with no record of who granted them.
--
-- "A client is calling" is auth.uid() IS NOT NULL, the house test: PostgREST
-- under the service key carries no sub, so auth.uid() is NULL there and only
-- there. INSERT is covered too: authenticated can insert its own profile row
-- ("Users can insert own profile"), and such a row must start on basico.
--
-- coach_plan_granted_by is a plain uuid, NOT a foreign key to users. An
-- ON DELETE SET NULL would UPDATE the comped coach's row while the admin's
-- delete runs under the admin's JWT, the guard would refuse it, and deleting
-- that admin's account would fail.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHO CAN READ WHAT
--
-- users has no table-level SELECT for anon or authenticated (066). This file
-- grants SELECT (coach_plan) to authenticated, so signed-in surfaces (home feed,
-- profile, storefront, signed-in session detail) can render the badge. It is
-- NOT granted to anon: signed-out visitors reach coach data only through
-- sessions_public, which is owner-run (security_invoker = false) and gets
-- creator_coach_plan below.
--
-- The other seven columns are withheld from every client. "Users can view all
-- profiles" is USING (true), so a grant would publish each coach's billing
-- state, Stripe ids and renewal date to every signed-in user. A coach reads
-- their own plan details through a server route on the service role. They are
-- listed in both users exclusion lists in verify-migration-state.sql and in
-- EXEMPT in its test, with this reason.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE 7-DAY GRACE IS NOT IN THE DATABASE
--
-- Stripe's dunning settings retry a failed renewal for 7 days and then cancel
-- the subscription; customer.subscription.deleted moves the coach back to
-- basico. So coach_plan is the public truth without a cron. hasProBenefits()
-- on the server keeps a 7-day backstop on coach_plan_current_period_end for a
-- missed webhook. Approved by Al, 2026-10-12.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- sessions_public: CREATE OR REPLACE, 222's definition verbatim (158's
-- columns plus is_test), with u.coach_plan AS creator_coach_plan appended last
-- so no existing column moves. CREATE OR REPLACE VIEW keeps the view's grants
-- and its COMMENT. The pre-flight below checks the live column list first (the
-- capture rule, as 222 does), so a later change to the view aborts this file
-- instead of being reverted by it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- RE-RUNNABLE. ADD COLUMN IF NOT EXISTS, DROP ... IF EXISTS before every CHECK,
-- index and trigger, CREATE OR REPLACE for the function and the view, ON
-- CONFLICT DO NOTHING for the record. One paste is one transaction (CLAUDE.md,
-- the 188 correction), so a failure anywhere below leaves nothing behind.

BEGIN;

-- ── 0. Pre-flight: sessions_public is 222's view, or this file's own ────────
DO $$
DECLARE
  v_cols text[];
  v_222 text[] := ARRAY['id','title','sport','date','start_time','end_time','duration','description','equipment','skill_level','photos','max_participants','current_participants','waitlist_count','join_policy','status','is_paid','price_cents','currency','creator_id','creator_name','creator_avatar_url','creator_average_rating','location','latitude','longitude','location_lat','location_lng','partner_id','partner_status','partner_reviewed_at','is_test'];
BEGIN
  SELECT array_agg(column_name::text ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sessions_public';
  IF v_cols IS DISTINCT FROM v_222 AND v_cols IS DISTINCT FROM (v_222 || ARRAY['creator_coach_plan']) THEN
    RAISE EXCEPTION '231 ABORTED: sessions_public is not 222''s view (columns: %); a later change would be reverted.', v_cols;
  END IF;
  IF pg_get_viewdef('public.sessions_public'::regclass) !~ 'invite_only' THEN
    RAISE EXCEPTION '231 ABORTED: sessions_public no longer excludes invite_only sessions; not 222''s view.';
  END IF;
END $$;

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS coach_plan                        text NOT NULL DEFAULT 'basico',
  ADD COLUMN IF NOT EXISTS coach_plan_status                 text,
  ADD COLUMN IF NOT EXISTS coach_plan_source                 text,
  ADD COLUMN IF NOT EXISTS coach_plan_stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS coach_plan_stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS coach_plan_current_period_end     timestamptz,
  ADD COLUMN IF NOT EXISTS coach_plan_granted_by             uuid,
  ADD COLUMN IF NOT EXISTS coach_plan_granted_at             timestamptz;

COMMENT ON COLUMN public.users.coach_plan IS
  'T-PLAN1. The coach''s plan: basico (free, default), pro, crecimiento (Stripe), or '
  'embajador (comp only, never sold). The only plan column clients can read; it '
  'drives the Pro and Embajador badges. Written by the server only (migration 231).';
COMMENT ON COLUMN public.users.coach_plan_status IS
  'T-PLAN1. active, past_due or canceled, mirrored from Stripe by the webhook. '
  'NULL for a coach who never had a plan. Not readable by any client role.';
COMMENT ON COLUMN public.users.coach_plan_source IS
  'T-PLAN1. stripe (paid) or comp (granted by an admin). The webhook never '
  'changes a comp. Not readable by any client role.';
COMMENT ON COLUMN public.users.coach_plan_stripe_customer_id IS
  'T-PLAN1. The coach-plan Stripe customer. Deliberately NOT '
  'tribe_os_stripe_customer_id: Tribe.OS webhooks key on that column. Unique.';
COMMENT ON COLUMN public.users.coach_plan_current_period_end IS
  'T-PLAN1. End of the current paid period, from Stripe. hasProBenefits keeps '
  'past_due benefits for 7 days after it as a backstop to Stripe''s dunning.';
COMMENT ON COLUMN public.users.coach_plan_granted_by IS
  'T-PLAN1. The admin who comped this plan. Plain uuid, not a foreign key; see '
  'migration 231''s header for why.';

-- ── 2. Allowed values, and one consistency rule ─────────────────────────────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_coach_plan_values;
ALTER TABLE public.users
  ADD CONSTRAINT users_coach_plan_values
  CHECK (coach_plan IN ('basico', 'pro', 'crecimiento', 'embajador'));

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_coach_plan_status_values;
ALTER TABLE public.users
  ADD CONSTRAINT users_coach_plan_status_values
  CHECK (coach_plan_status IS NULL OR coach_plan_status IN ('active', 'past_due', 'canceled'));

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_coach_plan_source_values;
ALTER TABLE public.users
  ADD CONSTRAINT users_coach_plan_source_values
  CHECK (coach_plan_source IS NULL OR coach_plan_source IN ('stripe', 'comp'));

-- A paid-tier plan always says where it came from; embajador is only ever a
-- comp; a comp always records when it was granted. basico may keep its last
-- source and status (a canceled Stripe coach reads basico / canceled / stripe).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_coach_plan_consistent;
ALTER TABLE public.users
  ADD CONSTRAINT users_coach_plan_consistent
  CHECK (
        (coach_plan = 'basico' OR coach_plan_source IS NOT NULL)
    AND (coach_plan <> 'embajador' OR coach_plan_source = 'comp')
    AND (coach_plan_source IS DISTINCT FROM 'comp' OR coach_plan_granted_at IS NOT NULL)
  );

-- One Tribe account per coach-plan Stripe customer, so the webhook's lookup by
-- customer id can never match two people.
DROP INDEX IF EXISTS public.users_coach_plan_stripe_customer_id_key;
CREATE UNIQUE INDEX users_coach_plan_stripe_customer_id_key
  ON public.users (coach_plan_stripe_customer_id)
  WHERE coach_plan_stripe_customer_id IS NOT NULL;

-- ── 3. The guard ────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER: it reads nothing but NEW, OLD and auth.uid(). search_path
-- pinned anyway, as the house guards do.
CREATE OR REPLACE FUNCTION public.guard_coach_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.coach_plan IS DISTINCT FROM 'basico'
      OR ROW(NEW.coach_plan_status, NEW.coach_plan_source, NEW.coach_plan_stripe_customer_id,
             NEW.coach_plan_stripe_subscription_id, NEW.coach_plan_current_period_end,
             NEW.coach_plan_granted_by, NEW.coach_plan_granted_at)
         IS DISTINCT FROM ROW(NULL::text, NULL::text, NULL::text, NULL::text,
                              NULL::timestamptz, NULL::uuid, NULL::timestamptz);
  ELSE
    v_changed := ROW(NEW.coach_plan, NEW.coach_plan_status, NEW.coach_plan_source,
                     NEW.coach_plan_stripe_customer_id, NEW.coach_plan_stripe_subscription_id,
                     NEW.coach_plan_current_period_end, NEW.coach_plan_granted_by,
                     NEW.coach_plan_granted_at)
      IS DISTINCT FROM ROW(OLD.coach_plan, OLD.coach_plan_status, OLD.coach_plan_source,
                           OLD.coach_plan_stripe_customer_id, OLD.coach_plan_stripe_subscription_id,
                           OLD.coach_plan_current_period_end, OLD.coach_plan_granted_by,
                           OLD.coach_plan_granted_at);
  END IF;

  IF v_changed AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'coach plans are set by the server only'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Written by the Stripe webhook and the admin comp route with the service role (migration 231).';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_coach_plan() IS
  'Migration 231. Refuses any coach_plan* write while auth.uid() is set (every client '
  'call, admins included). Needed because authenticated holds a table-level UPDATE '
  'and INSERT on users.';

DROP TRIGGER IF EXISTS users_coach_plan_guard ON public.users;
CREATE TRIGGER users_coach_plan_guard
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_plan();

-- ── 4. Who can read it ──────────────────────────────────────────────────────
GRANT SELECT (coach_plan) ON public.users TO authenticated;

-- ── 5. The signed-out read path ─────────────────────────────────────────────
-- 222's definition, verbatim, with creator_coach_plan appended last.
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
  s.is_test,
  -- T-PLAN1 (231): the badge for signed-out visitors. Appended last.
  u.coach_plan AS creator_coach_plan
FROM public.sessions s
LEFT JOIN public.users u ON u.id = s.creator_id
-- invite_only sessions are EXCLUDED from the anon view (see 138's header). IS
-- DISTINCT FROM (not <>) so a NULL join_policy -- an unset, non-private session
-- -- stays discoverable rather than being dropped by NULL-comparison semantics.
WHERE s.join_policy IS DISTINCT FROM 'invite_only';

-- ── 6. Assert the end state, after the writes ───────────────────────────────
DO $$
DECLARE
  v_col text;
  v_tg record;
  v_last text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['coach_plan', 'coach_plan_status', 'coach_plan_source',
                               'coach_plan_stripe_customer_id', 'coach_plan_stripe_subscription_id'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute
                    WHERE attrelid = 'public.users'::regclass
                      AND attname = v_col AND NOT attisdropped
                      AND atttypid = 'text'::regtype) THEN
      RAISE EXCEPTION '231 ABORTED: users.% is missing or is not text.', v_col;
    END IF;
  END LOOP;
  FOREACH v_col IN ARRAY ARRAY['coach_plan_current_period_end', 'coach_plan_granted_at'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute
                    WHERE attrelid = 'public.users'::regclass
                      AND attname = v_col AND NOT attisdropped
                      AND atttypid = 'timestamptz'::regtype) THEN
      RAISE EXCEPTION '231 ABORTED: users.% is missing or is not timestamptz.', v_col;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.users'::regclass
                  AND attname = 'coach_plan_granted_by' AND NOT attisdropped
                  AND atttypid = 'uuid'::regtype) THEN
    RAISE EXCEPTION '231 ABORTED: users.coach_plan_granted_by is missing or is not uuid.';
  END IF;

  -- NOT NULL with default 'basico': every existing coach, and every new signup,
  -- starts on the free plan.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                   JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                  WHERE a.attrelid = 'public.users'::regclass AND a.attname = 'coach_plan'
                    AND a.attnotnull
                    AND pg_get_expr(d.adbin, d.adrelid) LIKE '''basico''%') THEN
    RAISE EXCEPTION '231 ABORTED: users.coach_plan is not NOT NULL DEFAULT ''basico''.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE coach_plan IS DISTINCT FROM 'basico'
                                          AND coach_plan_source IS NULL) THEN
    RAISE EXCEPTION '231 ABORTED: an account holds a plan with no source.';
  END IF;

  -- Present AND validated: a NOT VALID constraint binds nothing already there.
  FOREACH v_col IN ARRAY ARRAY['users_coach_plan_values', 'users_coach_plan_status_values',
                               'users_coach_plan_source_values', 'users_coach_plan_consistent'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.users'::regclass
                      AND conname = v_col AND contype = 'c' AND convalidated) THEN
      RAISE EXCEPTION '231 ABORTED: CHECK % is missing or not validated.', v_col;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_index i
                  WHERE i.indexrelid = to_regclass('public.users_coach_plan_stripe_customer_id_key')
                    AND i.indisunique AND i.indisvalid) THEN
    RAISE EXCEPTION '231 ABORTED: users_coach_plan_stripe_customer_id_key is missing or not unique.';
  END IF;

  -- The trigger: present, enabled, row-level, BEFORE, on INSERT and UPDATE, and
  -- calling THIS function. tgtype bits: 1 ROW, 2 BEFORE, 4 INSERT, 16 UPDATE.
  SELECT t.tgtype, t.tgenabled, t.tgfoid INTO v_tg FROM pg_trigger t
   WHERE t.tgrelid = 'public.users'::regclass AND t.tgname = 'users_coach_plan_guard'
     AND NOT t.tgisinternal;
  IF v_tg.tgtype IS NULL THEN
    RAISE EXCEPTION '231 ABORTED: users_coach_plan_guard is missing.';
  END IF;
  IF (v_tg.tgtype & 1) = 0 OR (v_tg.tgtype & 2) = 0 OR (v_tg.tgtype & 4) = 0 OR (v_tg.tgtype & 16) = 0
     OR v_tg.tgenabled <> 'O'
     OR v_tg.tgfoid <> 'public.guard_coach_plan()'::regprocedure THEN
    RAISE EXCEPTION '231 ABORTED: users_coach_plan_guard is not an enabled BEFORE INSERT OR UPDATE row trigger on guard_coach_plan().';
  END IF;

  -- Reads. coach_plan: signed-in users yes, anon no. Everything else: no client.
  -- has_column_privilege resolves table and column grants together, so this
  -- also catches a table-level SELECT appearing.
  IF NOT has_column_privilege('authenticated', 'public.users', 'coach_plan', 'SELECT') THEN
    RAISE EXCEPTION '231 ABORTED: authenticated cannot SELECT users.coach_plan; every signed-in badge query would fail with 42501.';
  END IF;
  IF has_column_privilege('anon', 'public.users', 'coach_plan', 'SELECT') THEN
    RAISE EXCEPTION '231 ABORTED: anon can SELECT users.coach_plan; signed-out reads go through sessions_public.';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['coach_plan_status', 'coach_plan_source', 'coach_plan_stripe_customer_id',
                               'coach_plan_stripe_subscription_id', 'coach_plan_current_period_end',
                               'coach_plan_granted_by', 'coach_plan_granted_at'] LOOP
    IF has_column_privilege('anon', 'public.users', v_col, 'SELECT')
       OR has_column_privilege('authenticated', 'public.users', v_col, 'SELECT') THEN
      RAISE EXCEPTION '231 ABORTED: a client role can SELECT users.%; billing state would be public.', v_col;
    END IF;
  END LOOP;
  FOREACH v_col IN ARRAY ARRAY['coach_plan', 'coach_plan_status', 'coach_plan_source',
                               'coach_plan_stripe_customer_id', 'coach_plan_stripe_subscription_id',
                               'coach_plan_current_period_end', 'coach_plan_granted_by',
                               'coach_plan_granted_at'] LOOP
    IF NOT has_column_privilege('service_role', 'public.users', v_col, 'UPDATE')
       OR NOT has_column_privilege('service_role', 'public.users', v_col, 'SELECT') THEN
      RAISE EXCEPTION '231 ABORTED: service_role cannot read or write users.%; the webhook would fail.', v_col;
    END IF;
  END LOOP;

  -- The view: creator_coach_plan is the LAST column, and both client roles can
  -- still read the view.
  SELECT attname INTO v_last FROM pg_attribute
   WHERE attrelid = 'public.sessions_public'::regclass AND attnum > 0 AND NOT attisdropped
   ORDER BY attnum DESC LIMIT 1;
  IF v_last IS DISTINCT FROM 'creator_coach_plan' THEN
    RAISE EXCEPTION '231 ABORTED: the last column of sessions_public is %, not creator_coach_plan.', coalesce(v_last, '(none)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'public.sessions_public'::regclass
                    AND attname = 'partner_reviewed_at' AND NOT attisdropped) THEN
    RAISE EXCEPTION '231 ABORTED: sessions_public lost partner_reviewed_at.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'public.sessions_public'::regclass
                    AND attname = 'is_test' AND NOT attisdropped) THEN
    RAISE EXCEPTION '231 ABORTED: sessions_public lost is_test; signed-out pages would show test sessions.';
  END IF;
  IF NOT has_table_privilege('anon', 'public.sessions_public', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.sessions_public', 'SELECT') THEN
    RAISE EXCEPTION '231 ABORTED: anon or authenticated can no longer read sessions_public; signed-out session pages would break.';
  END IF;

  RAISE NOTICE '231: eight coach_plan columns, server-only writes, coach_plan readable by signed-in users, creator_coach_plan on sessions_public.';
END $$;

-- ── Record this migration as applied ────────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('231_t_plan1_coach_plans',
        'T-PLAN1 part A: users.coach_plan* x8, CHECKs, unique coach-plan customer id, server-only guard trigger; coach_plan readable by authenticated; sessions_public.creator_coach_plan appended')
ON CONFLICT (migration) DO NOTHING;

COMMIT;
