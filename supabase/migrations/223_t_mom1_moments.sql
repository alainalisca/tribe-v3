-- 223_t_mom1_moments.sql
--
-- T-MOM1 Part A: Moments. Photos of a session, shot by its host, an admin or
-- a photographer the host names, delivered privately to the people tagged in
-- them. NOT APPLIED when written (2026-10-19).
--
-- NUMBER: 223. Read 2026-10-19 after `git fetch`: origin/main ends at 222;
-- 219 is reserved for T-PLAN1 (only its two branches carry it); no branch
-- carries 223 or higher.
--
-- ADDITIVE ONLY. Four new tables, three helper functions, one private bucket.
-- Nothing existing is altered; no existing row is read or written.
--
--   session_media          one row per photo. storage_path is the original
--                          (max 2400 px, EXIF stripped) in the `moments`
--                          bucket; the w1200 and w400 WebP variants sit next
--                          to it as <path>.1200.webp and <path>.400.webp.
--                          deleted_at is a soft delete (a nightly job removes
--                          the files 7 days later, Part B).
--   media_invites          a person in the photos who is not on Tribe yet:
--                          a name, an optional WhatsApp number (E.164), a
--                          32-character token for /m/<token>/, 30 days to
--                          claim. Never readable by a client: server routes
--                          only (no policy, no grant).
--   session_media_tags     who is in which photo: a user OR an invite, never
--                          both, at most once per photo. delivered_at is set
--                          by "Entregar" (nothing is visible to the tagged
--                          person before it), removed_at by "Quitarme de esta
--                          foto", show_on_coach_page and thanked_at by the
--                          person in the photo.
--   session_photographers  who besides the host may upload to a session
--                          ("Fotógrafo de esta sesión").
--
-- WHO READS WHAT (SELECT policies; every write goes through a server route
-- with the service role after canUploadToSession, so there are no INSERT,
-- UPDATE or DELETE policies and no write grants):
--
--   session_media          its uploader; the session's host, photographers
--                          and admins (can_manage_session_moments); a person
--                          tagged in it, once delivered, not removed, and
--                          not deleted.
--   session_media_tags     the tagged user's own tag, once delivered; the
--                          uploader, host, photographers and admins of the
--                          photo's session. A tagged person never sees who
--                          else is tagged.
--   session_photographers  the photographer themself; the session's host
--                          and admins.
--   media_invites          nobody but the service role.
--   storage `moments`      PRIVATE, and no storage.objects policy at all:
--                          only the service role reads or writes files, and
--                          the app hands out signed URLs (1 hour) after its
--                          own check. anon has nothing anywhere.
--
-- The helpers are SECURITY DEFINER for the same reason as 199's: the policies
-- on session_media and session_media_tags read each other, and a definer
-- function answers the question without recursing through the caller's RLS.
--
-- ORDER: apply this file, record it (scripts/syncMigrationsApplied.ts 223 and
-- scripts/freezeMigrations.ts), then run scripts/moveRecapPhotosToMoments.ts
-- (dry run first). The code reading these tables arrives in Parts B to D.

BEGIN;

-- ── Pre-flight ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name IN ('session_media', 'session_media_tags', 'media_invites', 'session_photographers')) THEN
    RAISE EXCEPTION '223 ABORTED: a Moments table already exists; this file creates them and would not match it.';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'moments') THEN
    RAISE EXCEPTION '223 ABORTED: a bucket named moments already exists.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'is_app_admin' AND p.pronargs = 0) THEN
    RAISE EXCEPTION '223 ABORTED: public.is_app_admin() is missing.';
  END IF;
END $$;

-- ── Tables ─────────────────────────────────────────────────────────────────
CREATE TABLE public.session_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX session_media_session_idx ON public.session_media (session_id) WHERE deleted_at IS NULL;
CREATE INDEX session_media_uploader_idx ON public.session_media (uploader_id);
COMMENT ON TABLE public.session_media IS
  'T-MOM1: one photo of a session. Original at storage_path in the private moments bucket; .1200.webp and .400.webp variants beside it.';

CREATE TABLE public.media_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (btrim(display_name) <> '' AND char_length(display_name) <= 80),
  phone text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  token text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9]{32}$'),
  claimed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE INDEX media_invites_session_idx ON public.media_invites (session_id);
COMMENT ON TABLE public.media_invites IS
  'T-MOM1: a person in the photos who is not on Tribe yet. Read and written only by server routes (service role).';

CREATE TABLE public.session_media_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.session_media(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  invite_id uuid REFERENCES public.media_invites(id) ON DELETE CASCADE,
  tagged_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  removed_at timestamptz,
  show_on_coach_page boolean NOT NULL DEFAULT false,
  thanked_at timestamptz,
  CONSTRAINT session_media_tags_one_subject CHECK ((user_id IS NULL) <> (invite_id IS NULL))
);
CREATE UNIQUE INDEX session_media_tags_once_per_photo
  ON public.session_media_tags (media_id, (COALESCE(user_id, invite_id)));
CREATE INDEX session_media_tags_user_idx ON public.session_media_tags (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX session_media_tags_invite_idx ON public.session_media_tags (invite_id) WHERE invite_id IS NOT NULL;
COMMENT ON TABLE public.session_media_tags IS
  'T-MOM1: a user or an invite in a photo. Visible to the tagged user only after delivered_at.';

CREATE TABLE public.session_photographers (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
COMMENT ON TABLE public.session_photographers IS
  'T-MOM1: who besides the host may upload photos to a session (granted by the host or an admin).';

-- ── Helpers (SECURITY DEFINER, see header) ─────────────────────────────────
CREATE FUNCTION public.can_manage_session_moments(p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = p_session AND s.creator_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.session_photographers p
                WHERE p.session_id = p_session AND p.user_id = auth.uid())
    OR public.is_app_admin()
  );
$fn$;

CREATE FUNCTION public.can_manage_session_media(p_media uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.session_media m
     WHERE m.id = p_media
       AND (m.uploader_id = auth.uid() OR public.can_manage_session_moments(m.session_id))
  );
$fn$;

CREATE FUNCTION public.is_delivered_to_me(p_media uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.session_media_tags t
     WHERE t.media_id = p_media
       AND t.user_id = auth.uid()
       AND t.delivered_at IS NOT NULL
       AND t.removed_at IS NULL
  );
$fn$;

REVOKE ALL ON FUNCTION public.can_manage_session_moments(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_session_media(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_delivered_to_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_session_moments(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_session_media(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_delivered_to_me(uuid) TO authenticated, service_role;

-- ── RLS and grants ─────────────────────────────────────────────────────────
ALTER TABLE public.session_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_media_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_photographers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.session_media, public.media_invites, public.session_media_tags, public.session_photographers
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.session_media, public.session_media_tags, public.session_photographers TO authenticated;
GRANT ALL ON public.session_media, public.media_invites, public.session_media_tags, public.session_photographers
  TO service_role;

CREATE POLICY "Moments: uploader, managers, and the delivered people in it"
  ON public.session_media FOR SELECT TO authenticated
  USING (
    uploader_id = auth.uid()
    OR public.can_manage_session_moments(session_id)
    OR (deleted_at IS NULL AND public.is_delivered_to_me(id))
  );

CREATE POLICY "Moment tags: my delivered tags, and the photo's managers"
  ON public.session_media_tags FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND delivered_at IS NOT NULL)
    OR public.can_manage_session_media(media_id)
  );

CREATE POLICY "Photographers: themselves and the session's managers"
  ON public.session_photographers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_session_moments(session_id));

-- media_invites: RLS on, no policy, no grant to anon or authenticated.

-- ── Storage: the private moments bucket ────────────────────────────────────
-- 10 MB a file covers a 2400 px JPEG original with room to spare; the
-- variants are WebP. No storage.objects policy: service role only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('moments', 'moments', false, 10485760, ARRAY['image/jpeg', 'image/webp']);

-- ── Post-flight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['session_media', 'media_invites', 'session_media_tags', 'session_photographers'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION '223 ABORTED: RLS is off on %.', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR has_table_privilege('anon', 'public.' || t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || t, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION '223 ABORTED: anon holds a privilege on %.', t;
    END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION '223 ABORTED: authenticated can write %; writes go through server routes only.', t;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.media_invites', 'SELECT') THEN
    RAISE EXCEPTION '223 ABORTED: authenticated can read media_invites; invite tokens are server-only.';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id = 'moments') IS DISTINCT FROM false THEN
    RAISE EXCEPTION '223 ABORTED: the moments bucket is not private.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
              AND (qual ILIKE '%moments%' OR with_check ILIKE '%moments%')) THEN
    RAISE EXCEPTION '223 ABORTED: a storage policy mentions the moments bucket; it must have none.';
  END IF;
END $$;

COMMIT;
