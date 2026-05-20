-- Migration 094: Release notes / "What's New" bottom sheet.
--
-- Adds a release_notes table for in-app changelog cards and a
-- last_seen_release column on users so the WhatsNewSheet shows once per
-- release version per user.
--
-- Per Claude_Code_Whats_New_Spec.md.

CREATE TABLE IF NOT EXISTS release_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  title text NOT NULL,
  title_es text NOT NULL,
  bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  bullets_es jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_url text,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_release_notes_published_at
  ON release_notes(published_at DESC);

ALTER TABLE release_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read release notes" ON release_notes;
CREATE POLICY "Anyone can read release notes"
  ON release_notes FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE intentionally service-role only — admin manages
-- via Supabase dashboard or a future /admin/release-notes UI.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_release text;

-- Seed the first release note. Athletes and instructors language, no
-- jargon, no version numbers in bullets.
INSERT INTO release_notes (version, title, title_es, bullets, bullets_es)
VALUES (
  '3.2.0',
  'What''s New in Tribe',
  'Novedades en Tribe',
  '["Light mode is here. Your eyes will thank you.", "Storefronts got a full redesign with tabs for sessions, packages, and more.", "Tips are live. Show your favorite instructors some love.", "Notifications actually work now. For real this time.", "You can share sessions to WhatsApp with one tap."]'::jsonb,
  '["El modo claro ya esta aqui. Tus ojos te lo agradeceran.", "Las vitrinas tienen un nuevo diseno con pestanas para sesiones, paquetes y mas.", "Las propinas estan activas. Apoya a tus instructores favoritos.", "Las notificaciones ahora funcionan de verdad.", "Puedes compartir sesiones a WhatsApp con un solo toque."]'::jsonb
)
ON CONFLICT (version) DO NOTHING;
