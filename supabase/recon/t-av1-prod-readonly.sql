-- ════════════════════════════════════════════════════════════════════════════
-- T-AV1 RECON -- PRODUCTION, READ ONLY, AGGREGATES ONLY
--
-- Paste this WHOLE file into the Supabase SQL editor, in ONE paste, and paste
-- the result table back. It is the only production query T-AV1 needs; every
-- structural question (columns, constraints, indexes, policies, triggers,
-- functions, RLS behaviour) was answered against the local stack, which
-- carries production's exact schema.
--
-- ─── WHAT THIS FILE WILL AND WILL NOT DO ────────────────────────────────────
--
--   * `BEGIN READ ONLY` makes every write a runtime error, not a matter of
--     trust. Any INSERT/UPDATE/DELETE/DDL that slipped in would abort with
--     25006 rather than run.
--   * `ROLLBACK` at the end, so even a successful read leaves no transaction
--     open in the editor.
--   * SELECT only. No DDL, no functions created, no temp tables.
--   * EVERY output value is a COUNT, a PERCENTAGE or a DATE BUCKET. There is
--     no name, email, phone, WhatsApp number, pass code, referral code, UUID
--     or free-text column anywhere in the result. `count(DISTINCT partner_id)`
--     emits a number; the ids themselves never leave the database.
--   * One result set, so there is one thing to copy back.
--
-- ─── ONE PASTE, NOT SEVERAL ─────────────────────────────────────────────────
--
-- CLAUDE.md records that atomicity here is per PASTE, not per statement, and
-- that migration 185 half-applied because an EXCERPT was pasted and committed
-- completely on its own. Nothing here writes, so a partial paste cannot
-- corrupt anything -- but a partial paste WILL give a partial answer that
-- looks like a whole one. Paste the file.
--
-- ─── PROVEN TO EXECUTE BEFORE IT WAS SENT ───────────────────────────────────
--
-- Run against the local stack (production's schema) on 2026-09-26 and returned
-- its full result set. Every table and column named below was confirmed to
-- exist there first. If a statement here errors on production, that is itself
-- the finding: it means production's schema has drifted from the dump in
-- supabase/av-local-schema.sql, and the error text says where.
--
-- ─── WHAT "ATHLETE" MEANS IN EVERY ROW BELOW ────────────────────────────────
--
-- `deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
--  AND is_admin IS NOT TRUE AND is_instructor IS NOT TRUE`
--
-- The first three are the same exclusions `public.users_discoverable` applies.
-- CLAUDE.md is explicit that a count without its predicate is a different
-- number that reads equally authoritatively, so the predicate is stated in the
-- `notes` column of every row it applies to, and `is_instructor IS NOT TRUE`
-- is spelled with IS NOT TRUE rather than `= false` because the column is
-- nullable and a NULL is an athlete.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN READ ONLY;

WITH
-- the athlete population, defined once so every row below agrees
athletes AS (
  SELECT id FROM public.users
   WHERE deleted_at IS NULL
     AND banned IS NOT TRUE
     AND is_test_account IS NOT TRUE
     AND is_admin IS NOT TRUE
     AND is_instructor IS NOT TRUE
),
all_real_users AS (
  SELECT id FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
),
-- 8 weekly buckets, most recent first. week 0 = the last 7 days.
weeks AS (SELECT generate_series(0, 7) AS w),
weekly AS (
  SELECT w.w,
         (SELECT count(DISTINCT u.id) FROM athletes u WHERE EXISTS (
            SELECT 1 FROM public.session_participants sp
             WHERE sp.user_id = u.id
               AND sp.joined_at >= now() - ((w.w + 1) * interval '7 days')
               AND sp.joined_at <  now() - (w.w * interval '7 days')
            UNION ALL
            SELECT 1 FROM public.session_attendance sa
             WHERE sa.user_id = u.id AND sa.attended IS TRUE
               AND sa.created_at >= (now() - ((w.w + 1) * interval '7 days'))::timestamp
               AND sa.created_at <  (now() - (w.w * interval '7 days'))::timestamp
            UNION ALL
            SELECT 1 FROM public.chat_messages cm
             WHERE cm.user_id = u.id
               AND cm.created_at >= now() - ((w.w + 1) * interval '7 days')
               AND cm.created_at <  now() - (w.w * interval '7 days')
         )) AS actives
    FROM weeks w
)
SELECT * FROM (

  -- ─── ITEM 6: population ───────────────────────────────────────────────────
  SELECT 10 AS ord, 'item6' AS item, 'users rows, all' AS metric,
         count(*)::text AS value,
         'no exclusions at all' AS notes FROM public.users
  UNION ALL SELECT 11,'item6','users, not deleted/banned/test', count(*)::text,
         'the users_discoverable exclusions' FROM all_real_users
  UNION ALL SELECT 12,'item6','ATHLETES (real, non-admin, non-instructor)', count(*)::text,
         'deleted_at IS NULL, banned/test/admin/instructor IS NOT TRUE' FROM athletes
  UNION ALL SELECT 13,'item6','instructors (real, non-admin)', count(*)::text,
         'is_instructor IS TRUE' FROM public.users
         WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
           AND is_admin IS NOT TRUE AND is_instructor IS TRUE
  UNION ALL SELECT 14,'item6','test accounts excluded by the above', count(*)::text,
         'is_test_account IS TRUE' FROM public.users WHERE is_test_account IS TRUE
  UNION ALL SELECT 15,'item6','soft-deleted or banned excluded', count(*)::text,
         'deleted_at NOT NULL OR banned' FROM public.users
         WHERE deleted_at IS NOT NULL OR banned IS TRUE

  -- ─── ITEM 6: weekly active athletes, 8 weeks ─────────────────────────────
  UNION ALL
  SELECT 20 + w, 'item6', 'weekly active athletes, week -' || w,
         actives::text,
         'any join, attended attendance row, or chat message in that 7-day window'
    FROM weekly

  -- ─── ITEM 2: session_attendance ──────────────────────────────────────────
  UNION ALL SELECT 30,'item2','session_attendance rows', count(*)::text,'' FROM public.session_attendance
  UNION ALL SELECT 31,'item2','  of those, attended IS TRUE', count(*)::text,'' FROM public.session_attendance WHERE attended IS TRUE
  UNION ALL SELECT 32,'item2','  of those, attended IS FALSE', count(*)::text,
         'FALSE is the column default, so this conflates "no-show" with "row created but never marked"'
         FROM public.session_attendance WHERE attended IS FALSE
  UNION ALL SELECT 33,'item2','  of those, attended IS NULL', count(*)::text,
         'null is possible: the column is nullable' FROM public.session_attendance WHERE attended IS NULL
  UNION ALL SELECT 34,'item2','distinct sessions with any attendance row', count(DISTINCT session_id)::text,'' FROM public.session_attendance
  UNION ALL SELECT 35,'item2','rows with NULL session_id or NULL user_id', count(*)::text,
         'both columns are nullable and UNIQUE treats NULLs as distinct, so these CAN duplicate'
         FROM public.session_attendance WHERE session_id IS NULL OR user_id IS NULL
  UNION ALL SELECT 36,'item2','duplicate (session_id,user_id) groups', count(*)::text,
         'expected 0: a UNIQUE constraint already exists. Non-zero means NULL-keyed rows.'
    FROM (SELECT session_id, user_id FROM public.session_attendance
           GROUP BY session_id, user_id HAVING count(*) > 1) d
  UNION ALL SELECT 37,'item2','past sessions (date < today)', count(*)::text,'' FROM public.sessions WHERE date < current_date
  UNION ALL SELECT 38,'item2','past sessions WITH any attendance row', count(*)::text,''
    FROM public.sessions s WHERE s.date < current_date
      AND EXISTS (SELECT 1 FROM public.session_attendance sa WHERE sa.session_id = s.id)
  UNION ALL SELECT 39,'item2','pct of past sessions with any attendance row',
         CASE WHEN (SELECT count(*) FROM public.sessions WHERE date < current_date) = 0 THEN 'n/a'
              ELSE round(100.0 * (SELECT count(*) FROM public.sessions s WHERE s.date < current_date
                                    AND EXISTS (SELECT 1 FROM public.session_attendance sa WHERE sa.session_id = s.id))
                         / (SELECT count(*) FROM public.sessions WHERE date < current_date), 1)::text || '%' END,
         'the coverage number T-AV2 needs'
  UNION ALL SELECT 40,'item2','attendance rows marked BY THE SESSION HOST', count(*)::text,
         'marked_by = sessions.creator_id'
    FROM public.session_attendance sa JOIN public.sessions s ON s.id = sa.session_id
   WHERE sa.marked_by = s.creator_id
  UNION ALL SELECT 41,'item2','attendance rows marked by someone else', count(*)::text,
         'admin, or a host who no longer owns the session'
    FROM public.session_attendance sa JOIN public.sessions s ON s.id = sa.session_id
   WHERE sa.marked_by IS DISTINCT FROM s.creator_id
  UNION ALL SELECT 42,'item2','attendance rows with marked_by NULL', count(*)::text,''
    FROM public.session_attendance WHERE marked_by IS NULL

  -- ─── ITEM 4: challenges ──────────────────────────────────────────────────
  UNION ALL SELECT 50,'item4','challenges rows', count(*)::text,'' FROM public.challenges
  UNION ALL SELECT 51,'item4','  active now (start<=now<=end)', count(*)::text,''
    FROM public.challenges WHERE start_date <= now() AND end_date >= now()
  UNION ALL SELECT 52,'item4','  distinct creators', count(DISTINCT creator_id)::text,'count only, no ids' FROM public.challenges
  UNION ALL SELECT 53,'item4','  is_instructor_challenge', count(*)::text,'' FROM public.challenges WHERE is_instructor_challenge IS TRUE
  UNION ALL SELECT 54,'item4','  is_public', count(*)::text,'' FROM public.challenges WHERE is_public IS TRUE
  UNION ALL SELECT 55,'item4','challenge_participants rows', count(*)::text,'' FROM public.challenge_participants
  UNION ALL SELECT 56,'item4','  distinct participants', count(DISTINCT user_id)::text,'count only, no ids' FROM public.challenge_participants
  UNION ALL SELECT 57,'item4','  with progress > 0', count(*)::text,
         'progress is written by the join trigger AND is client-writable -- see T-AV1 item 3'
         FROM public.challenge_participants WHERE progress > 0
  UNION ALL SELECT 58,'item4','  with completed_at set', count(*)::text,'' FROM public.challenge_participants WHERE completed_at IS NOT NULL
  UNION ALL SELECT 59,'item4','  progress GREATER than the challenge target', count(*)::text,
         'a non-zero here is evidence of a progress value no legitimate path produces'
    FROM public.challenge_participants cp JOIN public.challenges c ON c.id = cp.challenge_id
   WHERE cp.progress > c.target_value

  -- ─── ITEM 7: pass_leads ──────────────────────────────────────────────────
  UNION ALL SELECT 70,'item7','pass_leads rows', count(*)::text,'' FROM public.pass_leads
  UNION ALL SELECT 71,'item7','  tribe_user_id set', count(*)::text,'' FROM public.pass_leads WHERE tribe_user_id IS NOT NULL
  UNION ALL SELECT 72,'item7','  tribe_user_id fill rate',
         CASE WHEN (SELECT count(*) FROM public.pass_leads) = 0 THEN 'n/a'
              ELSE round(100.0 * (SELECT count(*) FROM public.pass_leads WHERE tribe_user_id IS NOT NULL)
                         / (SELECT count(*) FROM public.pass_leads), 1)::text || '%' END,
         'share of claims made by a logged-in Tribe user'
  UNION ALL SELECT 73,'item7','  distinct partners with a lead', count(DISTINCT partner_id)::text,'count only, no ids' FROM public.pass_leads
  UNION ALL SELECT 74,'item7','  contacted_at set', count(*)::text,'' FROM public.pass_leads WHERE contacted_at IS NOT NULL
  UNION ALL SELECT 75,'item7','  contacted_at fill rate',
         CASE WHEN (SELECT count(*) FROM public.pass_leads) = 0 THEN 'n/a'
              ELSE round(100.0 * (SELECT count(*) FROM public.pass_leads WHERE contacted_at IS NOT NULL)
                         / (SELECT count(*) FROM public.pass_leads), 1)::text || '%' END, ''
  UNION ALL SELECT 76,'item7','  notified_at set', count(*)::text,'' FROM public.pass_leads WHERE notified_at IS NOT NULL
  UNION ALL SELECT 77,'item7','featured_partners with pass_active', count(*)::text,'' FROM public.featured_partners WHERE pass_active IS TRUE
  UNION ALL SELECT 78,'item7','featured_partners total', count(*)::text,'' FROM public.featured_partners

  -- ─── ITEM 9: referrals ───────────────────────────────────────────────────
  UNION ALL SELECT 90,'item9','referral_codes rows', count(*)::text,'' FROM public.referral_codes
  UNION ALL SELECT 91,'item9','referrals rows', count(*)::text,'' FROM public.referrals
  UNION ALL SELECT 92,'item9','  referred_id set (a real signup attached)', count(*)::text,''
    FROM public.referrals WHERE referred_id IS NOT NULL
  UNION ALL SELECT 93,'item9','  completed_at set', count(*)::text,'' FROM public.referrals WHERE completed_at IS NOT NULL
  UNION ALL SELECT 94,'item9','  converted_at set', count(*)::text,'' FROM public.referrals WHERE converted_at IS NOT NULL
  UNION ALL SELECT 95,'item9','  reward_granted', count(*)::text,'' FROM public.referrals WHERE reward_granted IS TRUE
  UNION ALL SELECT 96,'item9','promo_codes rows', count(*)::text,'' FROM public.promo_codes
  UNION ALL SELECT 97,'item9','promo_redemptions rows', count(*)::text,'' FROM public.promo_redemptions

  -- ─── ORPHAN SURFACES (T-AV7) and the notification finding ────────────────
  UNION ALL SELECT 110,'t-av7','connections rows', count(*)::text,'' FROM public.connections
  UNION ALL SELECT 111,'t-av7','  accepted', count(*)::text,'' FROM public.connections WHERE status = 'accepted'
  UNION ALL SELECT 112,'t-av7','user_follows rows', count(*)::text,'' FROM public.user_follows
  UNION ALL SELECT 113,'t-av7','notifications rows', count(*)::text,'' FROM public.notifications
  UNION ALL SELECT 114,'t-av7','  notifications with an actor_id', count(*)::text,
         'context for the spoofing finding: actor_id is client-settable today'
         FROM public.notifications WHERE actor_id IS NOT NULL
  UNION ALL SELECT 115,'t-av7','chat_messages rows, DM-scoped (session_id NULL)', count(*)::text,
         'these are the DMs whose push never fires -- T-AV1 item 8'
         FROM public.chat_messages WHERE session_id IS NULL
  UNION ALL SELECT 116,'t-av7','chat_messages rows, session-scoped', count(*)::text,''
         FROM public.chat_messages WHERE session_id IS NOT NULL
  UNION ALL SELECT 117,'t-av7','push_subscriptions rows', count(*)::text,
         'how many devices could receive a push at all' FROM public.push_subscriptions

  -- ─── SESSIONS, for context on every rate above ───────────────────────────
  UNION ALL SELECT 130,'context','sessions rows', count(*)::text,'' FROM public.sessions
  UNION ALL SELECT 131,'context','session_participants rows', count(*)::text,'' FROM public.session_participants
  UNION ALL SELECT 132,'context','  confirmed', count(*)::text,'' FROM public.session_participants WHERE status = 'confirmed'
  UNION ALL SELECT 133,'context','sessions with >1 confirmed participant', count(*)::text,
         'the density claim in the program spec, measured'
    FROM (SELECT session_id FROM public.session_participants WHERE status = 'confirmed'
           GROUP BY session_id HAVING count(*) > 1) m

) r
ORDER BY ord;

ROLLBACK;
