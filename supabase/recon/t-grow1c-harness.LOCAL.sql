-- t-grow1c-harness.LOCAL.sql
--
-- A MINIMAL LOCAL MODEL OF public.users, for running migration 214's rehearsal
-- before it is pasted into production. Not a migration, never applied anywhere
-- but a throwaway cluster (t-grow1c-rehearsal.LOCAL.sh makes and destroys it).
--
-- Separate from t-grow1-harness.LOCAL.sql on purpose: that file is pinned at
-- HARNESS_ASSUMES_APPLIED_THROUGH 210 by harnessConstraintParity.test.ts and
-- models pass_leads, which 214 does not touch.
--
-- WHAT IT MODELS, AND WHERE EACH FACT CAME FROM. Measured on production
-- 2026-10-09 through the Management API, SELECT only:
--   * authenticated holds TABLE-LEVEL UPDATE and INSERT on public.users, and no
--     table-level SELECT (column grants only) -- the premise of 214's trigger
--   * the RLS policies, by name, command and predicate (the subset below is
--     every INSERT and UPDATE policy, and one SELECT)
--   * handle_new_user's body, verbatim, including its EXCEPTION WHEN OTHERS
--   * prevent_is_admin_self_update, verbatim, so a pre-existing BEFORE UPDATE
--     guard is present alongside 214's, as on production
--   * users.id references auth.users(id); email is NOT NULL UNIQUE
--
-- WHAT IT DOES NOT MODEL: the other ~100 users columns, the other guards,
-- and any data. A green run here says the SQL runs and the arms mean what they
-- say against this model. It does NOT say production will pass; the live
-- rehearsal decides that.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;

-- nullif BEFORE the cast: set_config(..., NULL, true) stores '' and ''::jsonb
-- is 22P02 (the stub bug t-grow1-harness.LOCAL.sql records).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id                 uuid PRIMARY KEY,
  email              text,
  created_at         timestamptz DEFAULT now(),
  raw_user_meta_data jsonb,
  is_sso_user        boolean NOT NULL DEFAULT false,
  is_anonymous       boolean NOT NULL DEFAULT false
);

CREATE TABLE public.users (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text NOT NULL UNIQUE,
  name            text,
  created_at      timestamptz DEFAULT now(),
  is_admin        boolean DEFAULT false,
  is_test_account boolean NOT NULL DEFAULT false
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Grants as measured: table-level INSERT and UPDATE, column-level SELECT.
GRANT INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT (id, name, created_at) ON public.users TO authenticated, anon;
GRANT ALL ON public.users TO service_role;

CREATE OR REPLACE FUNCTION public.is_app_admin_uid(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT is_admin FROM public.users WHERE id = p), false);
$$;
CREATE OR REPLACE FUNCTION public.is_app_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_app_admin_uid(auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.is_app_admin(), public.is_app_admin_uid(uuid) TO anon, authenticated, service_role;

-- The policies, as measured (every INSERT and UPDATE one, and one SELECT).
CREATE POLICY "Users can view all profiles" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admin can update users" ON public.users FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'alainalisca@aplusfitnessllc.com');
CREATE POLICY "Admins can update any user" ON public.users FOR UPDATE USING ((auth.uid() = id) OR is_app_admin());
CREATE POLICY users_update_own_profile ON public.users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY users_update_policy ON public.users FOR UPDATE USING (auth.uid() = id);

-- handle_new_user, verbatim from production.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- prevent_is_admin_self_update, verbatim from production.
CREATE OR REPLACE FUNCTION public.prevent_is_admin_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF auth.uid() IS NOT NULL AND NOT is_app_admin_uid(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can modify is_admin'
        USING HINT = 'Contact an existing admin to grant this role.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER users_is_admin_guard BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_is_admin_self_update();

-- What 214 re-comments, with 213's EXACT text (it contains "v1.1", which matters).
CREATE TABLE public.attribution_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
COMMENT ON TABLE public.attribution_events IS
  'T-GROW1 part D. One row per tagged visit (and per share click), written only by '
  'POST /api/attr with the service role. Read only by the admin Origen tab through '
  '/api/admin/data behind requireApiAdmin(). Holds NO user id, NO ip and NO user '
  'agent: a row is a tagged visit and is deliberately not a person. Linking a visit '
  'to an account is the purpose the published data policy v1.0 does not cover, and '
  'waits for v1.1 with T-GROW1 part C.';

CREATE TABLE public.migrations_applied (migration text PRIMARY KEY, note text, applied_at timestamptz DEFAULT now());

-- Seed: an admin and three ordinary accounts, through the real signup path.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (gen_random_uuid(), 'admin@harness.local', '{"name":"Admin"}'),
  (gen_random_uuid(), 'user1@harness.local', '{"name":"User One"}'),
  (gen_random_uuid(), 'user2@harness.local', '{"name":"User Two"}'),
  (gen_random_uuid(), 'user3@harness.local', '{"name":"User Three"}');
UPDATE public.users SET is_admin = true WHERE email = 'admin@harness.local';
UPDATE public.users SET created_at = now() - interval '40 days' WHERE email <> 'user3@harness.local';
