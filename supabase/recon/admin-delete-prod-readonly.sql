-- ════════════════════════════════════════════════════════════════════════════
-- admin_delete_user DAMAGE CHECK -- PRODUCTION, READ ONLY, COUNTS ONLY
--
-- Paste this WHOLE file into the Supabase SQL editor, in ONE paste, and paste
-- the result table back.
--
-- ─── WHY ─────────────────────────────────────────────────────────────────────
--
-- Until Al's hand fix on 2026-09-27 (migration 196 on
-- fix/admin-delete-user-anon), `anon` could EXECUTE public.admin_delete_user,
-- which is SECURITY DEFINER with no caller check. Anyone with the public anon
-- key could soft-delete any user. Migration 050 introduced the function; it is
-- in git from 2026-04-21, so the window is roughly 2026-04-21 to 2026-09-27.
-- When 050 was actually applied to production is not recorded anywhere this
-- file can read.
--
-- ─── WHAT THIS FILE WILL AND WILL NOT DO ────────────────────────────────────
--
--   * `BEGIN READ ONLY`: any write is a runtime error (25006), not a matter
--     of trust. `ROLLBACK` at the end.
--   * SELECT only. No DDL, no functions, no temp tables.
--   * EVERY output value is a COUNT, a WEEK BUCKET or a yes/no. No id, name,
--     email or free text leaves the database.
--   * One result set.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE FINGERPRINT, AND ITS LIMIT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Three code paths set users.deleted_at, and they leave different rows:
--
--   SELF-SERVICE  /api/account/delete -> softDeleteUser (lib/dal/users.ts)
--                 sets deleted_at AND anonymizes: name = 'Deleted User',
--                 email = 'deleted-<id>@deleted.tribe.app', is_active = false.
--   ADMIN ROUTE   /api/admin/users/[id]/delete -> admin_delete_user
--                 sets deleted_at ONLY. Name and email untouched.
--   THE HOLE      anon -> /rest/v1/rpc/admin_delete_user
--                 IDENTICAL to the admin route: same function, same row.
--
-- So this can separate "self-service" from "went through admin_delete_user".
-- It CANNOT separate an admin's deletion from an attacker's. No table records
-- admin deletions:
--   * the admin route writes no audit row (it calls logError only on failure);
--   * admin_role_audit records is_admin changes, not deletions;
--   * gym_audit_log is scoped to Tribe.OS gyms (row 401 below counts any
--     user-deletion-looking entries in it anyway, so the claim is checked,
--     not assumed).
--
-- "Other" (the `other` column) is a row that is neither fully anonymized nor fully
-- untouched: a hand edit, a partial failure of softDeleteUser, or a path not
-- known when this was written. Any non-zero there is worth a question.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT CAN ONLY BE ANSWERED OUTSIDE THE DATABASE
-- ═══════════════════════════════════════════════════════════════════════════
--
--   * WHO called it. Supabase API logs (dashboard, Logs, API) record each
--     POST /rest/v1/rpc/admin_delete_user with its role; a call with role
--     `anon` is the attacker, `service_role` is the admin route. Retention
--     depends on the plan and is short, so older calls are gone.
--   * Vercel request logs for POST /api/admin/users/<id>/delete/: every
--     legitimate admin deletion has one. Also short retention.
--   * WHAT WAS DESTROYED. admin_delete_user HARD-deletes the target's
--     chat_messages and session_participants and the sessions they created.
--     Those rows are gone; nothing here can count them. Point-in-time
--     recovery or a backup is the only record.
--   * Admin memory. The admins can say how many users they deleted and
--     roughly when; row 300 is the number to compare against.
--
-- Proven to execute on the local stack (production's schema) on 2026-09-27,
-- and checked against a known answer: inside a rolled-back transaction, one
-- seed user deleted through admin_delete_user and one anonymized the way
-- softDeleteUser does produced exactly 1 and 1 in the right columns.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN READ ONLY;

WITH classified AS (
  SELECT
    date_trunc('week', (u.deleted_at AT TIME ZONE 'America/Bogota'))::date AS wk,
    (u.name = 'Deleted User' AND u.email LIKE 'deleted-%@deleted.tribe.app') AS anonymized,
    (u.name IS DISTINCT FROM 'Deleted User'
       AND coalesce(u.email, '') NOT LIKE 'deleted-%@deleted.tribe.app') AS untouched,
    u.is_admin IS TRUE AS was_admin,
    u.is_test_account IS TRUE AS was_test,
    u.deleted_at
  FROM public.users u
  WHERE u.deleted_at IS NOT NULL
),
weeks AS (
  SELECT generate_series(
           date_trunc('week', (now() AT TIME ZONE 'America/Bogota'))::date - 77,
           date_trunc('week', (now() AT TIME ZONE 'America/Bogota'))::date,
           interval '7 days')::date AS wk
)
SELECT * FROM (
  -- ── 10x: the last 12 weeks, every week present even when it is zero ────────
  SELECT 100 + row_number() OVER (ORDER BY w.wk) AS seq,
         'week of ' || w.wk::text AS bucket,
         count(c.*)                                        AS soft_deleted,
         count(c.*) FILTER (WHERE c.anonymized)            AS self_service,
         count(c.*) FILTER (WHERE c.untouched)             AS via_admin_delete_user,
         count(c.*) FILTER (WHERE NOT c.anonymized AND NOT c.untouched) AS other,
         count(c.*) FILTER (WHERE c.untouched AND c.was_test)  AS via_admin_fn_test_accounts,
         count(c.*) FILTER (WHERE c.untouched AND c.was_admin) AS via_admin_fn_admin_accounts
  FROM weeks w
  LEFT JOIN classified c ON c.wk = w.wk
  GROUP BY w.wk

  UNION ALL
  -- ── 20x: the whole exposure window, and before it ─────────────────────────
  SELECT 201, 'window 2026-04-20 to now (all of it)',
         count(*), count(*) FILTER (WHERE anonymized), count(*) FILTER (WHERE untouched),
         count(*) FILTER (WHERE NOT anonymized AND NOT untouched),
         count(*) FILTER (WHERE untouched AND was_test), count(*) FILTER (WHERE untouched AND was_admin)
  FROM classified WHERE deleted_at >= '2026-04-20'
  UNION ALL
  SELECT 202, 'before 2026-04-20 (predates 050)',
         count(*), count(*) FILTER (WHERE anonymized), count(*) FILTER (WHERE untouched),
         count(*) FILTER (WHERE NOT anonymized AND NOT untouched),
         count(*) FILTER (WHERE untouched AND was_test), count(*) FILTER (WHERE untouched AND was_admin)
  FROM classified WHERE deleted_at < '2026-04-20'
  UNION ALL
  -- Control: after the 2026-09-27 fix, anon cannot reach the function. A
  -- via_admin_delete_user count here is the admin route or a service key.
  SELECT 203, 'after 2026-09-27 (post-fix control)',
         count(*), count(*) FILTER (WHERE anonymized), count(*) FILTER (WHERE untouched),
         count(*) FILTER (WHERE NOT anonymized AND NOT untouched),
         count(*) FILTER (WHERE untouched AND was_test), count(*) FILTER (WHERE untouched AND was_admin)
  FROM classified WHERE deleted_at >= '2026-09-27'

  UNION ALL
  -- ── 300: the number to compare with what the admins remember ─────────────
  SELECT 300, 'NOT via the admin screen is unknowable here; this is the ceiling',
         count(*) FILTER (WHERE untouched AND deleted_at >= '2026-04-20'),
         NULL, NULL, NULL, NULL, NULL
  FROM classified

  UNION ALL
  -- ── 40x: is there any audit trail at all? (1 = yes, 0 = no) ───────────────
  SELECT 401, 'gym_audit_log rows that look like a user deletion',
         (SELECT count(*) FROM public.gym_audit_log
           WHERE action ILIKE '%delet%' AND coalesce(target_type, '') ILIKE '%user%'),
         NULL, NULL, NULL, NULL, NULL
  UNION ALL
  SELECT 402, 'tables named like an admin/deletion audit log (0 = none exist)',
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name ~* '(admin_(audit|action|log)|audit_log$|user_deletion|account_deletion|deleted_users)'
             AND table_name NOT IN ('admin_role_audit', 'gym_audit_log')),
         NULL, NULL, NULL, NULL, NULL
  UNION ALL
  SELECT 403, 'anon can execute admin_delete_user now (1 = STILL OPEN)',
         has_function_privilege('anon', 'public.admin_delete_user(uuid)', 'EXECUTE')::int,
         NULL, NULL, NULL, NULL, NULL
) r
ORDER BY seq;

ROLLBACK;
