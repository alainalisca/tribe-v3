-- t-grow2-harness.LOCAL.sql
--
-- A MINIMAL LOCAL MODEL for running migration 215's rehearsal before it is
-- pasted into production. Throwaway cluster only (t-grow2-rehearsal.LOCAL.sh).
--
-- WHAT IT MODELS, measured on production 2026-10-09 (Management API, SELECT only):
--   * referrals: its columns, NO unique on referral_code, the three policies by
--     name and predicate ("Users can insert referrals" WITH CHECK auth.uid() =
--     referrer_id; two own-rows SELECT policies), table-level grants to anon
--     and authenticated
--   * pass_leads: the five policies by name and kind (two RESTRICTIVE), anon and
--     authenticated INSERT, authenticated SELECT, pass_code UNIQUE and its
--     173 CHECK; the claim policy's predicate is a SUBSET of production's (the
--     length/format/pass_is_active clauses), and the program policy covers only
--     attended_at. Enough for 215's arms; not a copy.
--   * featured_partners: the three unique keys 211's clone dodges, pass_active
--   * handle_new_user verbatim, so the throwaway signups take the real path
--
-- A green run here says the SQL runs and the arms mean what they say against
-- this model. Production decides.

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

CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(), raw_user_meta_data jsonb,
  is_sso_user boolean NOT NULL DEFAULT false, is_anonymous boolean NOT NULL DEFAULT false
);
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE, name text, created_at timestamptz DEFAULT now(), is_admin boolean DEFAULT false
);
GRANT SELECT (id, name, created_at) ON public.users TO anon, authenticated;
GRANT ALL ON public.users TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth' AS $function$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$ SELECT coalesce((SELECT is_admin FROM public.users WHERE id = auth.uid()), false); $$;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO anon, authenticated, service_role;

CREATE TABLE public.featured_partners (
  id uuid PRIMARY KEY, slug text UNIQUE, user_id uuid UNIQUE, business_name text,
  status text, pass_active boolean DEFAULT false, created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.featured_partners TO anon, authenticated;
GRANT ALL ON public.featured_partners TO service_role;
CREATE OR REPLACE FUNCTION public.pass_is_active(p_partner uuid, p_slug text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT pass_active FROM public.featured_partners WHERE id = p_partner AND slug = p_slug), false);
$$;
GRANT EXECUTE ON FUNCTION public.pass_is_active(uuid, text) TO anon, authenticated, service_role;

CREATE TABLE public.pass_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL, partner_id uuid NOT NULL REFERENCES public.featured_partners(id),
  name text NOT NULL, whatsapp text NOT NULL, email text NOT NULL,
  pass_code text NOT NULL UNIQUE CHECK (pass_code ~ '^[A-Z]{2}-[A-Z2-9]{4}$'),
  consent_text text NOT NULL, attr_ref text, attended_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.pass_leads ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON public.pass_leads TO anon, authenticated;
GRANT SELECT ON public.pass_leads TO authenticated;
GRANT ALL ON public.pass_leads TO service_role;
CREATE POLICY "Anyone can claim a pass" ON public.pass_leads FOR INSERT WITH CHECK (
  char_length(name) BETWEEN 2 AND 80 AND whatsapp ~ '^\+[1-9][0-9]{7,14}$'
  AND char_length(consent_text) BETWEEN 20 AND 500 AND pass_is_active(partner_id, slug) AND attended_at IS NULL);
CREATE POLICY "Admins manage pass leads" ON public.pass_leads USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "Partner reads own leads" ON public.pass_leads FOR SELECT USING (is_app_admin() OR EXISTS (
  SELECT 1 FROM public.featured_partners fp WHERE fp.id = pass_leads.partner_id AND fp.user_id = auth.uid()));
CREATE POLICY "Attribution columns are server only" ON public.pass_leads AS RESTRICTIVE FOR INSERT WITH CHECK (attr_ref IS NULL);
CREATE POLICY "Program columns are server only" ON public.pass_leads AS RESTRICTIVE FOR INSERT WITH CHECK (attended_at IS NULL);

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL, status text, reward_granted boolean,
  created_at timestamptz DEFAULT now(), completed_at timestamptz, converted_at timestamptz
);
CREATE INDEX idx_referrals_code ON public.referrals (referral_code);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.referrals TO anon, authenticated, service_role;
CREATE POLICY "Users can insert referrals" ON public.referrals FOR INSERT WITH CHECK (auth.uid() = referrer_id);
CREATE POLICY "Users can read own referrals" ON public.referrals FOR SELECT USING ((auth.uid() = referrer_id) OR (auth.uid() = referred_id));
CREATE POLICY "Users can view own referrals" ON public.referrals FOR SELECT USING ((auth.uid() = referrer_id) OR (auth.uid() = referred_id));

CREATE TABLE public.migrations_applied (migration text PRIMARY KEY, note text, applied_at timestamptz DEFAULT now());

-- Seed: one real-looking partner for the clone to copy, an admin, and one
-- existing code row (production has 7, all code rows).
INSERT INTO public.featured_partners (id, slug, user_id, business_name, status, pass_active)
VALUES (gen_random_uuid(), 'bullbox', NULL, 'Model Partner', 'active', true);
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (gen_random_uuid(), 'admin@harness.local', '{"name":"Admin"}');
UPDATE public.users SET is_admin = true WHERE email = 'admin@harness.local';
INSERT INTO public.referrals (referrer_id, referral_code, status)
SELECT id, 'TRIBE-SEED1', 'pending' FROM public.users WHERE email = 'admin@harness.local';
