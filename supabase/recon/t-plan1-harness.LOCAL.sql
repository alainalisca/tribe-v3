-- t-plan1-harness.LOCAL.sql
--
-- A MINIMAL LOCAL MODEL OF public.users, public.sessions and sessions_public,
-- for running migration 231's rehearsal before it goes anywhere else. Not a
-- migration, never applied anywhere but a throwaway cluster
-- (t-plan1-rehearsal.LOCAL.sh makes and destroys it).
--
-- Built from t-grow1c-harness.LOCAL.sql (214), whose users model was measured
-- on production 2026-10-09, plus:
--   * public.sessions with every column sessions_public reads
--   * sessions_public exactly as 222 defines it (158's columns plus is_test,
--     appended last by T-JOIN1b); anon and authenticated can SELECT
--   * users.avatar_url and users.average_rating, granted like the rest
--
-- WHAT IT DOES NOT MODEL: the other ~100 users columns, the other guards, the
-- sessions write grants, and any real data. A green run here says the SQL runs
-- and the arms mean what they say against this model. The rehearsal run against
-- the local Supabase stack (production's dumped schema) is the stronger check.

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
  avatar_url      text,
  average_rating  numeric,
  created_at      timestamptz DEFAULT now(),
  is_admin        boolean DEFAULT false,
  is_test_account boolean NOT NULL DEFAULT false
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Grants as measured: table-level INSERT and UPDATE, column-level SELECT.
GRANT INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT (id, name, avatar_url, average_rating, created_at) ON public.users TO authenticated, anon;
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

-- The policies, as measured (every INSERT and UPDATE one, and the SELECT ones).
CREATE POLICY "Users can view all profiles" ON public.users FOR SELECT USING (true);
CREATE POLICY users_select_instructor_public ON public.users FOR SELECT TO anon USING (true);
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

-- sessions: every column sessions_public reads, and nothing else.
CREATE TABLE public.sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text,
  sport                text,
  date                 date,
  start_time           time,
  end_time             time,
  duration             integer,
  description          text,
  equipment            text,
  skill_level          text,
  photos               text[],
  max_participants     integer,
  current_participants integer DEFAULT 0,
  waitlist_count       integer DEFAULT 0,
  join_policy          text,
  status               text DEFAULT 'active',
  is_paid              boolean DEFAULT false,
  price_cents          integer,
  currency             text,
  creator_id           uuid REFERENCES public.users(id),
  location             text,
  latitude             double precision,
  longitude            double precision,
  location_lat         double precision,
  location_lng         double precision,
  partner_id           uuid,
  partner_status       text,
  partner_reviewed_at  timestamptz,
  is_test              boolean NOT NULL DEFAULT false
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.sessions TO service_role;

-- sessions_public, 222's definition verbatim (158's plus is_test, last).
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
  round(s.latitude::numeric, 3) AS latitude,
  round(s.longitude::numeric, 3) AS longitude,
  round(s.location_lat::numeric, 3) AS location_lat,
  round(s.location_lng::numeric, 3) AS location_lng,
  s.partner_id,
  s.partner_status,
  s.partner_reviewed_at,
  s.is_test
FROM public.sessions s
LEFT JOIN public.users u ON u.id = s.creator_id
WHERE s.join_policy IS DISTINCT FROM 'invite_only';
GRANT SELECT ON public.sessions_public TO anon, authenticated;
COMMENT ON VIEW public.sessions_public IS
  'RLS-H4 anon-facing projection of public.sessions. Coordinates rounded to 3dp; invite_only sessions EXCLUDED entirely.';

CREATE TABLE public.migrations_applied (migration text PRIMARY KEY, note text, applied_at timestamptz DEFAULT now());
INSERT INTO public.migrations_applied (migration, note) VALUES ('230_t_del2_keep_shared_files', 'harness');

-- Seed: an admin and three ordinary accounts, through the real signup path,
-- and four sessions (one invite_only, which the view must keep hiding).
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (gen_random_uuid(), 'admin@harness.local', '{"name":"Admin"}'),
  (gen_random_uuid(), 'user1@harness.local', '{"name":"User One"}'),
  (gen_random_uuid(), 'user2@harness.local', '{"name":"User Two"}'),
  (gen_random_uuid(), 'user3@harness.local', '{"name":"User Three"}');
UPDATE public.users SET is_admin = true WHERE email = 'admin@harness.local';
INSERT INTO public.sessions (title, sport, date, join_policy, creator_id)
SELECT 'Harness ' || u.name, 'running', current_date + 2, jp, u.id
FROM public.users u
CROSS JOIN (VALUES ('open'), ('invite_only')) AS j(jp)
WHERE u.email IN ('user1@harness.local', 'user2@harness.local');
