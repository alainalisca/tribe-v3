-- 214_t_grow1_signup_attribution.sql
--
-- T-GROW1 part C: record how an ACCOUNT arrived, once, at signup.
--
-- Covered by Politica de tratamiento de datos v1.1 (approved by Al 2026-10-09),
-- section 3: "how you arrived at Tribe (the link, campaign or referral code you
-- used) and, if someone invited you, who invited you." 211 and 213 both say in
-- their headers that this purpose waited for v1.1. It is the reason part C
-- shipped after the rest of T-GROW1.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IT ADDS
--
--   public.users.signup_src, signup_code, signup_ref, signup_utm_source,
--     signup_utm_medium, signup_utm_campaign, signup_utm_content,
--     signup_landing_path      text, the LAST touch that predates the account
--   public.users.signup_first_touch    jsonb, the first touch, whole
--   public.users.signup_attributed_at  timestamptz, stamped by the server
--
-- Same split as pass_leads in 211: flat columns are the visit that brought the
-- person in, the jsonb is where they first came from. The spec named six flat
-- columns; utm_content and landing_path are added because pass_leads has both
-- and an Origen query joining the two would otherwise have to special-case
-- accounts. Written by POST /api/attr/signup/ with the service role, and by
-- nothing else.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A TRIGGER, AND WHY A COLUMN GRANT COULD NOT DO THIS
--
-- Measured on production 2026-10-09 (Management API, SELECT only):
--   has_table_privilege('authenticated', 'public.users', 'UPDATE') = true
-- A TABLE-LEVEL UPDATE. Every column added to users is therefore writable by
-- its owner through users_update_own_profile the moment it exists, and a
-- column-level REVOKE cannot take a table-level privilege away (CLAUDE.md, the
-- 093 entry). Four permissive UPDATE policies OR together, so a policy edit
-- would be theatre too. What is left is what already guards is_admin, banned
-- and deleted_at: a BEFORE trigger.
--
-- Unlike those three, this one does NOT exempt admins. Nobody has a reason to
-- hand-edit how a person arrived, and an admin path would be a second writer
-- whose rows are indistinguishable from the route's. The house test for "a
-- client is calling" is the same one those guards use, auth.uid() IS NOT NULL:
-- PostgREST under the service key carries no sub, so auth.uid() is NULL there
-- and only there.
--
-- The trigger also makes the columns WRITE-ONCE for everybody, service role
-- included: once signup_attributed_at is set, the only permitted change is
-- erasing all of them (a deletion request under Ley 1581). The route's
-- `WHERE signup_attributed_at IS NULL` is the first line of that; this is the
-- one that survives a future route forgetting it.
--
-- And it covers INSERT, not only UPDATE: authenticated also holds INSERT on
-- users under "Users can insert own profile", and handle_new_user swallows its
-- own errors, so a profile row created by the client is a real path.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NOT READABLE BY ANY CLIENT ROLE, DELIBERATELY
--
-- users has no table-level SELECT for anon or authenticated (066), so a new
-- column is unreadable until granted, and this file grants nothing. Every
-- signed-in user can read every other user's granted columns ("Users can view
-- all profiles" is USING (true)), so granting these would publish how each
-- person arrived and who invited them to everyone. The admin reads them with
-- the service role. They are added to both exclusion lists in
-- verify-migration-state.sql and to EXEMPT in its test, with this reason.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AND attribution_events' COMMENT
--
-- 213 put a COMMENT ON TABLE in the database saying linking a visit to an
-- account "is the purpose the published data policy v1.0 does not cover, and
-- waits for v1.1". v1.1 is approved, so that comment is now wrong about the
-- policy. It is replaced below rather than 213 being edited (213 is applied and
-- its file is immutable). The table's design does not change: it still holds no
-- user id, now by choice rather than for want of authorization.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- RE-RUNNABLE. ADD COLUMN IF NOT EXISTS, DROP ... IF EXISTS before every CHECK
-- and the trigger, CREATE OR REPLACE for the function, ON CONFLICT DO NOTHING
-- for the record. One paste is one transaction (CLAUDE.md, the 188 correction),
-- so a failure anywhere below leaves nothing behind.

BEGIN;

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_src           text,
  ADD COLUMN IF NOT EXISTS signup_code          text,
  ADD COLUMN IF NOT EXISTS signup_ref           text,
  ADD COLUMN IF NOT EXISTS signup_utm_source    text,
  ADD COLUMN IF NOT EXISTS signup_utm_medium    text,
  ADD COLUMN IF NOT EXISTS signup_utm_campaign  text,
  ADD COLUMN IF NOT EXISTS signup_utm_content   text,
  ADD COLUMN IF NOT EXISTS signup_landing_path  text,
  ADD COLUMN IF NOT EXISTS signup_first_touch   jsonb,
  ADD COLUMN IF NOT EXISTS signup_attributed_at timestamptz;

COMMENT ON COLUMN public.users.signup_attributed_at IS
  'T-GROW1 part C. When the server recorded how this account arrived. NULL means '
  'nothing was recorded: the person arrived untagged, or signed up before part C '
  'existed (2026-10). It is NOT the signup time; that is created_at. Written once '
  'by /api/attr/signup with the service role; users_signup_attribution_guard '
  'refuses any client write and any second write. Not readable by any client role.';
COMMENT ON COLUMN public.users.signup_src IS
  'T-GROW1 part C. The src of the LAST tagged touch captured before this account '
  'was created (as are signup_code, signup_ref, signup_utm_*, signup_landing_path). '
  'A touch from after signup is never credited. See signup_attributed_at.';
COMMENT ON COLUMN public.users.signup_ref IS
  'T-GROW1 part C. The ?ref= referral code on the touch that brought this account '
  'in, uppercased. Recording who invited a person is covered by policy v1.1 '
  'sections 3 and 4.';
COMMENT ON COLUMN public.users.signup_first_touch IS
  'T-GROW1 part C. The FIRST touch, whole, as captured (src, code, ref, the four '
  'utm_*, landing_path, ts), if it predates the account. Same shape and bound as '
  'pass_leads.first_touch.';

-- ── 2. Size bounds, and one consistency rule ────────────────────────────────
--
-- The same bounds 211 put on pass_leads, for the same reasons (its header has
-- them, including why length(::text) and not pg_column_size). These cannot cost
-- an account: the only writer is a server route, after the shared sanitizers.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_signup_attr_tag_bounds;
ALTER TABLE public.users
  ADD CONSTRAINT users_signup_attr_tag_bounds
  CHECK (
        (signup_src          IS NULL OR char_length(signup_src)          BETWEEN 1 AND 40)
    AND (signup_code         IS NULL OR char_length(signup_code)         BETWEEN 1 AND 40)
    AND (signup_ref          IS NULL OR char_length(signup_ref)          BETWEEN 1 AND 40)
    AND (signup_utm_source   IS NULL OR char_length(signup_utm_source)   BETWEEN 1 AND 40)
    AND (signup_utm_medium   IS NULL OR char_length(signup_utm_medium)   BETWEEN 1 AND 40)
    AND (signup_utm_campaign IS NULL OR char_length(signup_utm_campaign) BETWEEN 1 AND 40)
    AND (signup_utm_content  IS NULL OR char_length(signup_utm_content)  BETWEEN 1 AND 40)
  );

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_signup_landing_path_bounds;
ALTER TABLE public.users
  ADD CONSTRAINT users_signup_landing_path_bounds
  CHECK (signup_landing_path IS NULL OR char_length(signup_landing_path) BETWEEN 1 AND 200);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_signup_first_touch_bounds;
ALTER TABLE public.users
  ADD CONSTRAINT users_signup_first_touch_bounds
  CHECK (signup_first_touch IS NULL
         OR (jsonb_typeof(signup_first_touch) = 'object' AND length(signup_first_touch::text) <= 2000));

-- No attribution without a stamp. Without this, "erase" could leave a signup_src
-- on a row whose signup_attributed_at says nothing was recorded, and the
-- trigger's write-once rule keys on signup_attributed_at alone.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_signup_attr_stamped;
ALTER TABLE public.users
  ADD CONSTRAINT users_signup_attr_stamped
  CHECK (
    signup_attributed_at IS NOT NULL
    OR (signup_src IS NULL AND signup_code IS NULL AND signup_ref IS NULL
        AND signup_utm_source IS NULL AND signup_utm_medium IS NULL
        AND signup_utm_campaign IS NULL AND signup_utm_content IS NULL
        AND signup_landing_path IS NULL AND signup_first_touch IS NULL)
  );

-- ── 3. The guard ────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER: it reads nothing but NEW, OLD and auth.uid(), so it needs
-- no privilege the caller lacks. search_path pinned anyway, as the house
-- guards do.
CREATE OR REPLACE FUNCTION public.guard_signup_attribution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.signup_attributed_at IS NOT NULL
      OR ROW(NEW.signup_src, NEW.signup_code, NEW.signup_ref, NEW.signup_utm_source,
             NEW.signup_utm_medium, NEW.signup_utm_campaign, NEW.signup_utm_content,
             NEW.signup_landing_path, NEW.signup_first_touch)
         IS DISTINCT FROM ROW(NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                              NULL::text, NULL::text, NULL::text, NULL::jsonb);
  ELSE
    v_changed := ROW(NEW.signup_src, NEW.signup_code, NEW.signup_ref, NEW.signup_utm_source,
                     NEW.signup_utm_medium, NEW.signup_utm_campaign, NEW.signup_utm_content,
                     NEW.signup_landing_path, NEW.signup_first_touch, NEW.signup_attributed_at)
      IS DISTINCT FROM ROW(OLD.signup_src, OLD.signup_code, OLD.signup_ref, OLD.signup_utm_source,
                           OLD.signup_utm_medium, OLD.signup_utm_campaign, OLD.signup_utm_content,
                           OLD.signup_landing_path, OLD.signup_first_touch, OLD.signup_attributed_at);
  END IF;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'signup attribution is recorded by the server only'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Written once by /api/attr/signup with the service role (migration 214).';
  END IF;

  -- Write-once. Erasure (every column back to NULL, enforced with this by
  -- users_signup_attr_stamped) is the one change allowed after the stamp.
  IF TG_OP = 'UPDATE' AND OLD.signup_attributed_at IS NOT NULL
     AND NEW.signup_attributed_at IS NOT NULL THEN
    RAISE EXCEPTION 'signup attribution is written once and is already recorded for this account'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_signup_attribution() IS
  'Migration 214. Refuses any signup_* write while auth.uid() is set (every client '
  'call, admins included), and any second write once signup_attributed_at is set. '
  'Needed because authenticated holds a table-level UPDATE on users.';

DROP TRIGGER IF EXISTS users_signup_attribution_guard ON public.users;
CREATE TRIGGER users_signup_attribution_guard
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_signup_attribution();

-- ── 4. attribution_events: the comment 213 wrote is wrong about the policy now
COMMENT ON TABLE public.attribution_events IS
  'T-GROW1 part D. One row per tagged visit (and per share click), written only by '
  'POST /api/attr with the service role. Read only by the admin Origen tab through '
  '/api/admin/data behind requireApiAdmin(). Holds NO user id, NO ip and NO user '
  'agent: a row is a tagged visit and is deliberately not a person. Policy v1.1 '
  '(2026-10-09) covers recording how a person arrived on their account, which '
  'migration 214 does on public.users (signup_*); this table is still not joined '
  'to an account, by design rather than for want of authorization.';

-- ── 5. Assert the end state, after the writes ───────────────────────────────
DO $$
DECLARE
  v_col text;
  v_tg record;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['signup_src', 'signup_code', 'signup_ref', 'signup_utm_source',
                               'signup_utm_medium', 'signup_utm_campaign', 'signup_utm_content',
                               'signup_landing_path'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute
                    WHERE attrelid = 'public.users'::regclass
                      AND attname = v_col AND NOT attisdropped
                      AND atttypid = 'text'::regtype) THEN
      RAISE EXCEPTION '214 ABORTED: users.% is missing or is not text.', v_col;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.users'::regclass
                  AND attname = 'signup_first_touch' AND NOT attisdropped
                  AND atttypid = 'jsonb'::regtype) THEN
    RAISE EXCEPTION '214 ABORTED: users.signup_first_touch is missing or is not jsonb.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.users'::regclass
                  AND attname = 'signup_attributed_at' AND NOT attisdropped
                  AND atttypid = 'timestamptz'::regtype) THEN
    RAISE EXCEPTION '214 ABORTED: users.signup_attributed_at is missing or is not timestamptz.';
  END IF;

  -- Present AND validated: a NOT VALID constraint binds nothing already there.
  FOREACH v_col IN ARRAY ARRAY['users_signup_attr_tag_bounds', 'users_signup_landing_path_bounds',
                               'users_signup_first_touch_bounds', 'users_signup_attr_stamped'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.users'::regclass
                      AND conname = v_col AND contype = 'c' AND convalidated) THEN
      RAISE EXCEPTION '214 ABORTED: CHECK % is missing or not validated.', v_col;
    END IF;
  END LOOP;

  -- The trigger: present, enabled, row-level, BEFORE, on INSERT and UPDATE, and
  -- calling THIS function. tgtype bits: 1 ROW, 2 BEFORE, 4 INSERT, 16 UPDATE.
  SELECT t.tgtype, t.tgenabled, t.tgfoid INTO v_tg FROM pg_trigger t
   WHERE t.tgrelid = 'public.users'::regclass AND t.tgname = 'users_signup_attribution_guard'
     AND NOT t.tgisinternal;
  IF v_tg.tgtype IS NULL THEN
    RAISE EXCEPTION '214 ABORTED: users_signup_attribution_guard is missing.';
  END IF;
  IF (v_tg.tgtype & 1) = 0 OR (v_tg.tgtype & 2) = 0 OR (v_tg.tgtype & 4) = 0 OR (v_tg.tgtype & 16) = 0
     OR v_tg.tgenabled <> 'O'
     OR v_tg.tgfoid <> 'public.guard_signup_attribution()'::regprocedure THEN
    RAISE EXCEPTION '214 ABORTED: users_signup_attribution_guard is not an enabled BEFORE INSERT OR UPDATE row trigger on guard_signup_attribution().';
  END IF;

  -- No client role can READ any of it. has_column_privilege resolves table and
  -- column grants together, so this also catches a table-level SELECT appearing.
  FOREACH v_col IN ARRAY ARRAY['signup_src', 'signup_code', 'signup_ref', 'signup_utm_source',
                               'signup_utm_medium', 'signup_utm_campaign', 'signup_utm_content',
                               'signup_landing_path', 'signup_first_touch', 'signup_attributed_at'] LOOP
    IF has_column_privilege('anon', 'public.users', v_col, 'SELECT')
       OR has_column_privilege('authenticated', 'public.users', v_col, 'SELECT') THEN
      RAISE EXCEPTION '214 ABORTED: a client role can SELECT users.%; how a person arrived would be public.', v_col;
    END IF;
    IF NOT has_column_privilege('service_role', 'public.users', v_col, 'UPDATE')
       OR NOT has_column_privilege('service_role', 'public.users', v_col, 'SELECT') THEN
      RAISE EXCEPTION '214 ABORTED: service_role cannot read or write users.%; /api/attr/signup would fail.', v_col;
    END IF;
  END LOOP;

  -- The replaced comment, read back, so a COMMENT that silently targeted the
  -- wrong object cannot pass. Anchored on 'migration 214', NOT on 'v1.1':
  -- 213's comment already contains "v1.1" ("waits for v1.1 with T-GROW1 part
  -- C"), so a v1.1 check passes with 213's text still in place. The first draft
  -- of this guard did exactly that; the local rehearsal's Part G caught it.
  IF position('migration 214' IN coalesce(obj_description('public.attribution_events'::regclass, 'pg_class'), '')) = 0 THEN
    RAISE EXCEPTION '214 ABORTED: the attribution_events comment was not replaced; it does not name migration 214.';
  END IF;

  RAISE NOTICE '214: ten signup attribution columns, bounded, server-write-once, unreadable by clients.';
END $$;

-- ── Record this migration as applied ────────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('214_t_grow1_signup_attribution',
        'T-GROW1 part C: users.signup_* x10, CHECKs, write-once server-only guard trigger; attribution_events comment for v1.1')
ON CONFLICT (migration) DO NOTHING;

COMMIT;
