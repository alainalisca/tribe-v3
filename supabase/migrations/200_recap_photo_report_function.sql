-- 200_recap_photo_report_function.sql
--
-- NORMAL PROCESS. NOT HAND-APPLIED.
--
-- Nothing in this file has been run in production. The branch
-- (hotfix/recap-report-policy) merges to main first, and only then is this
-- file applied, WHOLE, in one transaction, stating which commit on main it
-- corresponds to. If the branch cannot be merged, this file is not applied.
--
-- NUMBER: 200. Read 2026-10-05 immediately before writing, after `git fetch`:
-- origin/main ends at 198 (d236656d); 199 is in PR #187 (hotfix/photo-privacy,
-- approved for merge); no branch or worktree carries 200 or higher. 200
-- REQUIRES 199 (it calls public.can_view_session_media), and the pre-flight
-- refuses to run without it. Re-check against origin/main before merge.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT PRODUCTION HAS (read 2026-10-04 and 2026-10-05, pg_policies)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   public.session_recap_photos, UPDATE or ALL:
--     "Admins can moderate recap photos"  ALL     TO authenticated  is_app_admin()
--     "Users can report photos"           UPDATE  TO public         USING (auth.role() = 'authenticated')
--                                                                    no WITH CHECK
--   authenticated holds table-level UPDATE.
--
-- THE HOLE. "Users can report photos" was meant to let someone flag a photo.
-- What it grants is the whole row: any signed-in user who can see a recap row
-- can rewrite its photo_url (point it at any image), user_id (re-attribute it),
-- session_id (move it to another session) or clear someone else's report. A
-- policy cannot say "only these columns" (migration-protocol skill, Step 5c).
-- Before 199 "can see" was every signed-in user; after 199 it is the session's
-- host, confirmed participants, the uploader and admins. Still a hole.
--
-- THE FIX. Drop the policy. Reporting goes through report_recap_photo(), a
-- SECURITY DEFINER function that writes exactly three columns: reported =
-- true, reported_by = the caller, reported_reason. The caller must be able to
-- see the photo under 199's rule. The admin policy stays as the only UPDATE
-- path, for moderation. The app's one writer (lib/dal/media.ts
-- updateRecapPhotoReport) calls the function in the same PR.
--
-- NOT CHANGED HERE: the INSERT policies on session_recap_photos check only
-- user_id = auth.uid(), not session membership. Reported to Al as a follow-up.

-- ── 0. Pre-flight ──────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_names text[];
  v_report text;
BEGIN
  IF to_regprocedure('public.can_view_session_media(text)') IS NULL THEN
    RAISE EXCEPTION '200 ABORTED: public.can_view_session_media(text) is missing. Apply 199 first.';
  END IF;

  SELECT array_agg(policyname::text ORDER BY policyname) INTO v_names
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'session_recap_photos' AND cmd IN ('UPDATE', 'ALL');

  IF v_names = ARRAY['Admins can moderate recap photos'] THEN
    RAISE NOTICE '200: already applied; re-running is a no-op apart from CREATE OR REPLACE.';
  ELSIF v_names IS DISTINCT FROM ARRAY['Admins can moderate recap photos', 'Users can report photos'] THEN
    RAISE EXCEPTION '200 ABORTED: UPDATE policies on session_recap_photos are not the two read on 2026-10-05. Live: %', v_names;
  ELSE
    -- The policy being dropped must still be the open one. If someone scoped
    -- it since, dropping it would discard that work.
    SELECT regexp_replace(coalesce(qual, '') || '|' || coalesce(with_check, ''), '\s+', '', 'g') INTO v_report
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'session_recap_photos' AND policyname = 'Users can report photos';
    IF v_report IS DISTINCT FROM '(auth.role()=''authenticated''::text)|' THEN
      RAISE EXCEPTION '200 ABORTED: "Users can report photos" is no longer the open policy read on 2026-10-05. Live: %', v_report;
    END IF;
  END IF;
END $pre$;

-- ── 1. The one way to report ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_recap_photo(p_photo_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_photo  record;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500);
BEGIN
  IF v_uid IS NULL OR p_photo_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  SELECT r.id, r.user_id, r.session_id INTO v_photo FROM public.session_recap_photos r WHERE r.id = p_photo_id;
  -- A photo the caller cannot see answers exactly like one that does not exist.
  IF NOT FOUND OR NOT (v_photo.user_id = v_uid OR public.can_view_session_media(v_photo.session_id::text)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  UPDATE public.session_recap_photos
     SET reported = true,
         reported_by = v_uid,
         reported_reason = coalesce(v_reason, 'No reason provided')
   WHERE id = p_photo_id;
  RETURN jsonb_build_object('success', true);
END;
$fn$;

COMMENT ON FUNCTION public.report_recap_photo(uuid, text) IS
  '200. Flags a recap photo for admin review. Writes only reported, reported_by (the caller) and reported_reason (trimmed, 500 max). Caller must be able to see the photo under 199''s rule.';

REVOKE ALL ON FUNCTION public.report_recap_photo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_recap_photo(uuid, text) TO authenticated, service_role;

-- ── 2. The open policy goes ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can report photos" ON public.session_recap_photos;

-- ── 3. Guards ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_n int;
BEGIN
  -- Policies are OR'd: any UPDATE or ALL policy other than the admin one
  -- reopens the hole under a different name.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'session_recap_photos'
     AND cmd IN ('UPDATE', 'ALL')
     AND coalesce(qual, '') <> 'is_app_admin()';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '200 ABORTED: % UPDATE policy(ies) on session_recap_photos admit someone other than an app admin.', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'session_recap_photos'
                  AND policyname = 'Admins can moderate recap photos' AND cmd = 'ALL') THEN
    RAISE EXCEPTION '200 ABORTED: the admin moderation policy is gone; admins could no longer clear a report.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.report_recap_photo(uuid,text)'))
     OR (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure('public.report_recap_photo(uuid,text)')) IS NULL THEN
    RAISE EXCEPTION '200 ABORTED: report_recap_photo must be SECURITY DEFINER with a pinned search_path.';
  END IF;
  IF has_function_privilege('anon', 'public.report_recap_photo(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.report_recap_photo(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '200 ABORTED: report_recap_photo has the wrong grants; reporting would fail or be open to anon.';
  END IF;
  RAISE NOTICE '200: recap photos are reported through report_recap_photo only.';
END $$;

-- ── 4. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('200_recap_photo_report_function', 'Recap photo reports go through report_recap_photo (three columns); the open "Users can report photos" UPDATE policy is dropped')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'session_recap_photos'
               AND policyname = 'Users can report photos')                         AS open_report_policy_gone_ok,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'session_recap_photos'
    AND cmd IN ('UPDATE', 'ALL') AND coalesce(qual, '') <> 'is_app_admin()') = 0     AS only_admin_updates_ok,
  has_function_privilege('authenticated', 'public.report_recap_photo(uuid,text)', 'EXECUTE') AS users_can_report_ok,
  NOT has_function_privilege('anon', 'public.report_recap_photo(uuid,text)', 'EXECUTE')      AS anon_cannot_report_ok,
  EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration = '200_recap_photo_report_function') AS recorded_ok;
