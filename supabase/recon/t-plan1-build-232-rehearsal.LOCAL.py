"""Build supabase/rehearsals/232_t_plan1_account_scrub_coach_plans_REHEARSAL.sql
with 232's body spliced in verbatim.  Usage: python3 supabase/recon/t-plan1-build-232-rehearsal.LOCAL.py .
"""
import re
import sys
from pathlib import Path

repo = Path(sys.argv[1])
mig = (repo / 'supabase/migrations/232_t_plan1_account_scrub_coach_plans.sql').read_text()
start = re.search(r'^BEGIN;[ \t]*\n', mig, re.M).end()
end = mig.index('-- ── Record this migration as applied')
body = mig[start:end].strip('\n')
MD5_228 = 'e627bfb752710462c42fcd3730eb00eb'

TEMPLATE = r"""-- 232_t_plan1_account_scrub_coach_plans_REHEARSAL.sql
--
-- Rehearsal for supabase/migrations/232_t_plan1_account_scrub_coach_plans.sql.
-- Everything runs inside ONE transaction that ends in ROLLBACK: nothing here
-- persists. Needs 231 on the database (232's pre-flight refuses without it);
-- on a stack without 231, supabase/recon/t-plan1-232-rehearsal.LOCAL.sh splices
-- 231's body in right after BEGIN, inside the same transaction.
--
-- Part A  232's body, verbatim (rehearsalBodyVerbatim.test.ts checks it).
-- Part S  the scrub on throwaway accounts made here (reh-232-*): a paying Pro
--         coach, an Embajador comp and a basico athlete are deleted; a
--         Crecimiento coach who is not deleted is the bystander.
-- Part T  the new body is 228's plus the eight lines and nothing else.
-- Every row must read PASS. 9 of 9.

BEGIN;

-- ═══ PART A: the migration body, verbatim ═══════════════════════════════════
@@BODY@@

-- ═══ PART S: the scrub ══════════════════════════════════════════════════════
CREATE TEMP TABLE reh232 (n int, arm text, state text, ok boolean) ON COMMIT DROP;

DO $$
DECLARE
  k_pro   uuid := 'a2320000-0000-4000-8000-000000000001';
  k_amb   uuid := 'a2320000-0000-4000-8000-000000000002';
  k_ath   uuid := 'a2320000-0000-4000-8000-000000000003';
  k_other uuid := 'a2320000-0000-4000-8000-000000000004';
  k_admin uuid := 'a2320000-0000-4000-8000-000000000005';
  k_end   timestamptz := date_trunc('second', now()) + interval '20 days';
  r record;
  v_ok boolean;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (k_pro,   'reh-232-pro@example.com',   '{}'::jsonb),
    (k_amb,   'reh-232-amb@example.com',   '{}'::jsonb),
    (k_ath,   'reh-232-ath@example.com',   '{}'::jsonb),
    (k_other, 'reh-232-other@example.com', '{}'::jsonb),
    (k_admin, 'reh-232-admin@example.com', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  -- A stack with the auth trigger already made these; one without it gets them here.
  INSERT INTO public.users (id, name, email) VALUES
    (k_pro,   'Reh Pro',   'reh-232-pro@example.com'),
    (k_amb,   'Reh Amb',   'reh-232-amb@example.com'),
    (k_ath,   'Reh Ath',   'reh-232-ath@example.com'),
    (k_other, 'Reh Other', 'reh-232-other@example.com'),
    (k_admin, 'Reh Admin', 'reh-232-admin@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- The webhook's and the comp route's writes (no JWT here: auth.uid() is NULL).
  UPDATE public.users SET coach_plan = 'pro', coach_plan_status = 'active', coach_plan_source = 'stripe',
         coach_plan_stripe_customer_id = 'cus_reh232pro', coach_plan_stripe_subscription_id = 'sub_reh232pro',
         coach_plan_current_period_end = k_end
   WHERE id = k_pro;
  UPDATE public.users SET coach_plan = 'embajador', coach_plan_status = 'active', coach_plan_source = 'comp',
         coach_plan_granted_by = k_admin, coach_plan_granted_at = now()
   WHERE id = k_amb;
  UPDATE public.users SET coach_plan = 'crecimiento', coach_plan_status = 'active', coach_plan_source = 'stripe',
         coach_plan_stripe_customer_id = 'cus_reh232other', coach_plan_stripe_subscription_id = 'sub_reh232other',
         coach_plan_current_period_end = k_end
   WHERE id = k_other;

  PERFORM public.account_scrub(k_pro);
  PERFORM public.account_scrub(k_amb);
  PERFORM public.account_scrub(k_ath);

  -- S1-S3: each deleted account reads basico with every other column NULL.
  FOR r IN SELECT * FROM (VALUES
      (1, 'S1 a paying Pro coach is deleted: basico, all seven coach_plan_* NULL', k_pro),
      (2, 'S2 an Embajador comp is deleted: basico, all seven NULL', k_amb),
      (3, 'S3 a basico athlete is deleted: still basico, all seven NULL', k_ath)) AS t(n, arm, id)
  LOOP
    SELECT u.coach_plan = 'basico'
       AND u.coach_plan_status IS NULL AND u.coach_plan_source IS NULL
       AND u.coach_plan_stripe_customer_id IS NULL AND u.coach_plan_stripe_subscription_id IS NULL
       AND u.coach_plan_current_period_end IS NULL AND u.coach_plan_granted_by IS NULL
       AND u.coach_plan_granted_at IS NULL
      INTO v_ok FROM public.users u WHERE u.id = r.id;
    INSERT INTO reh232
    SELECT r.n, r.arm,
           concat_ws(' / ', coach_plan, coalesce(coach_plan_status, 'null'), coalesce(coach_plan_source, 'null'),
                     coalesce(coach_plan_stripe_customer_id, 'null'), coalesce(coach_plan_stripe_subscription_id, 'null'),
                     coalesce(coach_plan_current_period_end::text, 'null'), coalesce(coach_plan_granted_by::text, 'null'),
                     coalesce(coach_plan_granted_at::text, 'null')),
           coalesce(v_ok, false)
      FROM public.users WHERE id = r.id;
  END LOOP;

  -- S4: the rest of the scrub still happens (228's behaviour unchanged).
  INSERT INTO reh232
  SELECT t.n, t.arm,
         format('name=%s email_deleted=%s deleted_at=%s', name,
                email = 'deleted-' || k_pro::text || '@deleted.invalid', deleted_at IS NOT NULL),
         name = 'Usuario eliminado' AND email = 'deleted-' || k_pro::text || '@deleted.invalid' AND deleted_at IS NOT NULL
    FROM (VALUES
      (4, 'S4 the rest of the scrub still runs: name, email, deleted_at')) AS t(n, arm)
    CROSS JOIN public.users WHERE id = k_pro;

  -- S5: someone else's plan is untouched.
  INSERT INTO reh232
  SELECT t.n, t.arm,
         concat_ws(' / ', coach_plan, coach_plan_source, coach_plan_stripe_subscription_id),
         coach_plan = 'crecimiento' AND coach_plan_stripe_subscription_id = 'sub_reh232other'
           AND coach_plan_stripe_customer_id = 'cus_reh232other' AND coach_plan_current_period_end = k_end
    FROM (VALUES
      (5, 'S5 a coach who is not deleted keeps their plan')) AS t(n, arm)
    CROSS JOIN public.users WHERE id = k_other;

  -- S6: safe to run again (deleteAccount reruns a deletion that stopped).
  BEGIN
    PERFORM public.account_scrub(k_pro);
    INSERT INTO reh232
    SELECT t.n, t.arm,
           concat_ws(' / ', coach_plan, coalesce(coach_plan_stripe_subscription_id, 'null')),
           coach_plan = 'basico' AND coach_plan_stripe_subscription_id IS NULL
      FROM (VALUES
        (6, 'S6 a second scrub of the same account succeeds, plan still cleared')) AS t(n, arm)
      CROSS JOIN public.users WHERE id = k_pro;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO reh232 VALUES (6, 'S6 a second scrub of the same account succeeds, plan still cleared', SQLSTATE || ' ' || SQLERRM, false);
  END;
END $$;

-- ═══ PART T: the body is 228's plus the eight lines, nothing else ═══════════
DO $$
DECLARE
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.account_scrub(uuid)'::regprocedure);
  v_from int;
  v_to int;
  v_stripped text;
  v_sets int;
BEGIN
  v_from := strpos(v_src, '    -- Their coach plan (231, T-PLAN1).');
  v_to := strpos(v_src, '    coach_plan_granted_at = NULL,' || chr(10));
  v_stripped := CASE WHEN v_from > 0 AND v_to > v_from
                     THEN left(v_src, v_from - 1) || substr(v_src, v_to + length('    coach_plan_granted_at = NULL,' || chr(10)))
                END;
  SELECT count(*) INTO v_sets
    FROM regexp_matches(v_src, '\n    coach_plan(_[a-z_]+)? = ', 'g');
  INSERT INTO reh232 VALUES
    (7, 'T1 with the coach-plan lines taken out, the body is 228''s exactly (md5)',
        coalesce(md5(v_stripped), '(lines not found)'), md5(v_stripped) IS NOT DISTINCT FROM '@@MD5_228@@'),
    (8, 'T2 the body sets all eight coach_plan columns', v_sets || ' of 8', v_sets = 8),
    (9, 'T3 232 is not recorded (the record row is outside this rehearsal)',
        (SELECT count(*) FROM public.migrations_applied WHERE migration LIKE '232%')::text,
        NOT EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration LIKE '232%'));
END $$;

-- The one result set for the transaction. Every row must read PASS. 9 of 9.
SELECT n AS "#", CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, arm, state
  FROM reh232 ORDER BY n;

ROLLBACK;
"""

out = TEMPLATE.replace('@@BODY@@', body).replace('@@MD5_228@@', MD5_228)
assert body in out and '@@' not in out
(repo / 'supabase/rehearsals/232_t_plan1_account_scrub_coach_plans_REHEARSAL.sql').write_text(out)
print('wrote rehearsal', len(out))
