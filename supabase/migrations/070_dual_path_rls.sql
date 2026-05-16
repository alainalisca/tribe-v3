-- 070_dual_path_rls.sql
-- Phase 2 Tribe.OS gym-tenant Path B: dual-path RLS.
--
-- Replaces the existing instructor-tenant RLS policies on clients and
-- client_attendance with policies that allow access via EITHER:
--   (a) the legacy instructor_user_id = auth.uid() path, or
--   (b) the new gym_coaches membership path.
--
-- Both paths are valid simultaneously during the transition. Once
-- every Tribe.OS user has been operating on the gym-tenant path for
-- some time, a future cleanup migration will drop branch (a) and
-- flip gym_id to NOT NULL. See docs/LATER.md.
--
-- Scope
-- -----
-- - clients: had FOR ALL policy "Instructors manage own clients".
--   Replaced with a four-policy split (select/insert/update/delete)
--   so the WITH CHECK side of insert can require gym_id to be
--   populated for the gym path, while update/delete/select remain
--   lenient (still accept legacy ownership without gym_id).
--
-- - client_attendance: had FOR ALL policy
--   "Instructors manage own client attendance" that used an EXISTS
--   subquery on clients.instructor_user_id. Replaced with a
--   four-policy split that accepts either the EXISTS-on-clients
--   path OR the EXISTS-on-gym_coaches path. We do NOT short-circuit
--   on client_attendance.gym_id alone because that column is
--   backfilled but not enforced — falling back to the join keeps
--   the policy correct even if a row's gym_id ever drifts.
--
-- - payments: not touched. Access is mediated by SECURITY DEFINER
--   functions (instructor_revenue_totals / instructor_revenue_buckets)
--   which already gate on auth.uid() = p_user_id (migration 064).
--   Direct table writes happen from the Stripe webhook with the
--   service-role client; no user-facing SELECT path exists today.
--   When the revenue dashboard is gym-aware (Mission 5), the SQL
--   function will be amended to accept either the user-id or the
--   gym-id contract; until then the per-user contract continues to
--   work because every coach can query their own payments via the
--   legacy creator_id path through sessions.
--
-- Soft-delete handling
-- --------------------
-- The existing clients policy did NOT filter `archived = false`;
-- it allowed an instructor to read and unarchive their own archived
-- rows. We preserve that behavior.
--
-- Rollback
-- --------
-- The DROP POLICY IF EXISTS pattern at the top lets you re-run this
-- migration safely. To roll back to instructor-only RLS, re-create
-- the original policies; the SQL is preserved in migration 062 for
-- reference.

-- ------------------------------------------------------------------
-- clients
-- ------------------------------------------------------------------

-- Drop the legacy FOR ALL policy. We replace it with split policies
-- so the WITH CHECK side of INSERT can have different rules than
-- the USING side of SELECT/UPDATE/DELETE.
DROP POLICY IF EXISTS "Instructors manage own clients" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_select" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_update" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_delete" ON public.clients;

CREATE POLICY "clients_tenant_select"
  ON public.clients FOR SELECT
  USING (
    -- Legacy path: caller is the direct instructor owner.
    instructor_user_id = auth.uid()
    -- New path: caller is a coach in the gym that owns this client.
    OR (
      gym_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = clients.gym_id AND gc.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "clients_tenant_insert"
  ON public.clients FOR INSERT
  WITH CHECK (
    -- Legacy: instructor_user_id matches the caller. Maintains
    -- backward compatibility with code paths that haven't been
    -- updated to pass gym_id yet.
    instructor_user_id = auth.uid()
    -- New: caller is a coach in the named gym. Insert WITH CHECK
    -- needs gym_id to be present for this branch to fire (we don't
    -- have a row to dereference yet).
    OR (
      gym_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = clients.gym_id AND gc.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "clients_tenant_update"
  ON public.clients FOR UPDATE
  USING (
    instructor_user_id = auth.uid()
    OR (
      gym_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = clients.gym_id AND gc.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    -- Don't let a row be reassigned to an instructor or gym the
    -- caller isn't part of.
    instructor_user_id = auth.uid()
    OR (
      gym_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = clients.gym_id AND gc.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "clients_tenant_delete"
  ON public.clients FOR DELETE
  USING (
    instructor_user_id = auth.uid()
    OR (
      gym_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = clients.gym_id AND gc.user_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------------
-- client_attendance
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS "Instructors manage own client attendance" ON public.client_attendance;
DROP POLICY IF EXISTS "client_attendance_tenant_select" ON public.client_attendance;
DROP POLICY IF EXISTS "client_attendance_tenant_insert" ON public.client_attendance;
DROP POLICY IF EXISTS "client_attendance_tenant_update" ON public.client_attendance;
DROP POLICY IF EXISTS "client_attendance_tenant_delete" ON public.client_attendance;

-- For client_attendance we join through clients in BOTH branches,
-- which gives us a single source of truth (the clients row) and lets
-- the legacy path keep working even on rows where the denormalized
-- gym_id column hasn't been backfilled. The gym path also goes
-- through clients.gym_id rather than client_attendance.gym_id for the
-- same reason.

CREATE POLICY "client_attendance_tenant_select"
  ON public.client_attendance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_attendance.client_id
        AND (
          c.instructor_user_id = auth.uid()
          OR (
            c.gym_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.gym_coaches gc
              WHERE gc.gym_id = c.gym_id AND gc.user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "client_attendance_tenant_insert"
  ON public.client_attendance FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_attendance.client_id
        AND (
          c.instructor_user_id = auth.uid()
          OR (
            c.gym_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.gym_coaches gc
              WHERE gc.gym_id = c.gym_id AND gc.user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "client_attendance_tenant_update"
  ON public.client_attendance FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_attendance.client_id
        AND (
          c.instructor_user_id = auth.uid()
          OR (
            c.gym_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.gym_coaches gc
              WHERE gc.gym_id = c.gym_id AND gc.user_id = auth.uid()
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_attendance.client_id
        AND (
          c.instructor_user_id = auth.uid()
          OR (
            c.gym_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.gym_coaches gc
              WHERE gc.gym_id = c.gym_id AND gc.user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "client_attendance_tenant_delete"
  ON public.client_attendance FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_attendance.client_id
        AND (
          c.instructor_user_id = auth.uid()
          OR (
            c.gym_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.gym_coaches gc
              WHERE gc.gym_id = c.gym_id AND gc.user_id = auth.uid()
            )
          )
        )
    )
  );

COMMENT ON POLICY "clients_tenant_select" ON public.clients IS
  'Dual-path: legacy instructor_user_id ownership OR new gym_coaches membership. Future cleanup migration removes branch (a) after all users have transitioned.';
COMMENT ON POLICY "client_attendance_tenant_select" ON public.client_attendance IS
  'Dual-path: joins through clients for both branches so the denormalized gym_id on client_attendance is informational, not load-bearing.';
