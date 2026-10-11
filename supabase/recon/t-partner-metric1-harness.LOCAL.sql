-- t-partner-metric1-harness.LOCAL.sql
--
-- A throwaway local model of the production pieces migration 217 touches, so
-- the rehearsal can be RUN before it is handed to the SQL editor. A green run
-- here means the SQL executes and the arms behave against this MODEL; it is not
-- evidence about production. The live rehearsal is.
--
-- Modelled on production (migrations 018, 019, 058, 159 to 163):
--   * roles anon, authenticated, service_role; auth.uid() from request.jwt.claims
--   * Supabase's default privileges: new functions in public are EXECUTE-able
--     by anon, authenticated and service_role, which is why 217 REVOKEs from
--     PUBLIC and GRANTs by name rather than relying on either default
--   * featured_partners NOT under a column grant regime (161): table-level
--     privileges to anon and authenticated, gated by RLS, no FORCE RLS
--   * its policies: read active or admin; partner updates own row; admin all
--   * public.migrations_applied
--   * one real-looking active partner with zeroed counters (bullbox)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$ SELECT false $$;

CREATE TABLE public.featured_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  slug text UNIQUE,
  business_name text NOT NULL,
  business_type text NOT NULL DEFAULT 'gym',
  tier text NOT NULL DEFAULT 'featured',
  status text NOT NULL DEFAULT 'pending',
  monthly_fee_cents int DEFAULT 0,
  total_impressions int DEFAULT 0,
  total_clicks int DEFAULT 0,
  total_bookings int DEFAULT 0,
  min_rating numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.featured_partners ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.featured_partners TO anon, authenticated, service_role;
CREATE POLICY "Anyone can read active or admin reads all" ON public.featured_partners
  FOR SELECT USING (status = 'active' OR public.is_app_admin());
CREATE POLICY "Partners manage own record" ON public.featured_partners
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all" ON public.featured_partners
  FOR ALL USING (public.is_app_admin());

INSERT INTO public.featured_partners (slug, business_name, status, user_id)
VALUES ('bullbox', 'BullBox', 'active', gen_random_uuid());

CREATE TABLE public.migrations_applied (
  migration text PRIMARY KEY,
  note text,
  applied_at timestamptz DEFAULT now()
);
