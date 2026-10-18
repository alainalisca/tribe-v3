-- 220_t_share1_card_photo_and_handle.sql
--
-- T-SHARE1 Part C: a coach's own link (/i/<handle>) and the photo its share
-- card shows. NOT APPLIED when written (2026-10-17). Order, as for every
-- migration here: merge the branch, then paste this from main, then record it.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IT ADDS TO public.users
-- ═══════════════════════════════════════════════════════════════════════════
--
--   card_photo_url      text   the photo the coach (or an admin) picked for
--                              their card; a Tribe storage URL
--   card_photo_box      jsonb  the crop inside it, fractions {x0,y0,x1,y1}
--   card_photo_rejects  text[] images an admin ruled out (stock, flyers, logos);
--                              the card never uses one
--   handle              text   the coach's link name, lowercase [a-z0-9_]{3,24},
--                              unique; /i/<handle> resolves alongside /i/<uuid>
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHO READS AND WRITES WHAT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- public.users is under column-level SELECT grants (066): a column no migration
-- grants is invisible to clients. handle, card_photo_url and card_photo_box
-- are public (the /i/ page is signed-out and resolves the handle as anon), so
-- they are granted to anon and authenticated. card_photo_rejects is NOT
-- granted: it is a moderation list, read by the card route with the service
-- role, and listed as withheld in verify-migration-state.test.ts.
--
-- Writes: authenticated holds UPDATE on users at table level and edits its own
-- row through the existing policies, so a coach can set their own handle and
-- card photo with no new grant. That same table-level UPDATE would let a coach
-- clear their own rejects, so card_photo_rejects gets a BEFORE UPDATE guard in
-- the shape of users_banned_guard (098): only an admin, or a context with no
-- auth.uid() (service role, this file), may change it.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE HANDLE PREFILL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Al, 2026-10-17: prefilled from `username` where it already fits; the others
-- are asked on their next profile edit; `username` itself is untouched.
-- Measured 2026-10-17, read-only: 15 of 19 instructors have a username and 6
-- of those match ^[a-z0-9_]{3,24}$. Only instructors, not deleted, and only a
-- username no other such instructor shares, so the unique index cannot abort
-- the prefill.

BEGIN;

-- Pre-flight: a column of the same name with a different type would make the
-- ADD COLUMN IF NOT EXISTS below a silent no-op. pg_attribute keyed on the
-- regclass, not information_schema by name (users exists in two schemas).
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(a.attname || ' is ' || format_type(a.atttypid, a.atttypmod), ', ')
    INTO v_bad
    FROM pg_attribute a
    JOIN (VALUES ('card_photo_url', 'text'), ('card_photo_box', 'jsonb'),
                 ('card_photo_rejects', 'text[]'), ('handle', 'text')) AS want(col, typ)
      ON want.col = a.attname
   WHERE a.attrelid = 'public.users'::regclass
     AND NOT a.attisdropped
     AND format_type(a.atttypid, a.atttypmod) <> want.typ;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '220 ABORTED: users already has a column of another type: %', v_bad;
  END IF;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS card_photo_url text,
  ADD COLUMN IF NOT EXISTS card_photo_box jsonb,
  ADD COLUMN IF NOT EXISTS card_photo_rejects text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS handle text;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_handle_format;
ALTER TABLE public.users
  ADD CONSTRAINT users_handle_format CHECK (handle IS NULL OR handle ~ '^[a-z0-9_]{3,24}$');

-- Fractions of the photo, left-top to right-bottom, inside it and not empty.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_card_photo_box_shape;
ALTER TABLE public.users
  ADD CONSTRAINT users_card_photo_box_shape CHECK (
    card_photo_box IS NULL OR (
      jsonb_typeof(card_photo_box) = 'object'
      AND jsonb_typeof(card_photo_box -> 'x0') = 'number'
      AND jsonb_typeof(card_photo_box -> 'y0') = 'number'
      AND jsonb_typeof(card_photo_box -> 'x1') = 'number'
      AND jsonb_typeof(card_photo_box -> 'y1') = 'number'
      AND (card_photo_box ->> 'x0')::numeric >= 0
      AND (card_photo_box ->> 'y0')::numeric >= 0
      AND (card_photo_box ->> 'x1')::numeric <= 1
      AND (card_photo_box ->> 'y1')::numeric <= 1
      AND (card_photo_box ->> 'x0')::numeric < (card_photo_box ->> 'x1')::numeric
      AND (card_photo_box ->> 'y0')::numeric < (card_photo_box ->> 'y1')::numeric
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS users_handle_key ON public.users (handle);

GRANT SELECT (handle, card_photo_url, card_photo_box) ON public.users TO authenticated, anon;

-- Only an admin, or a context with no auth.uid() (service role, migrations),
-- changes the rejects. Shape of prevent_banned_self_update (098).
CREATE OR REPLACE FUNCTION public.prevent_card_photo_rejects_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.card_photo_rejects IS DISTINCT FROM OLD.card_photo_rejects THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_app_admin_uid(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can modify card_photo_rejects'
        USING HINT = 'Rejected card photos are set by Tribe moderators.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_card_photo_rejects_guard ON public.users;
CREATE TRIGGER users_card_photo_rejects_guard
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_card_photo_rejects_self_update();

-- The prefill: instructors whose username already fits and is theirs alone.
WITH fits AS (
  SELECT id, username, count(*) OVER (PARTITION BY username) AS n
    FROM public.users
   WHERE is_instructor = true
     AND deleted_at IS NULL
     AND handle IS NULL
     AND username ~ '^[a-z0-9_]{3,24}$'
)
UPDATE public.users u
   SET handle = f.username
  FROM fits f
 WHERE u.id = f.id
   AND f.n = 1
   AND NOT EXISTS (SELECT 1 FROM public.users o WHERE o.handle = f.username);

-- Post-flight: what the code relies on, asserted here so a partial apply fails
-- loudly instead of reading as success.
DO $$
DECLARE
  v_prefilled int;
BEGIN
  IF NOT has_column_privilege('anon', 'public.users', 'handle', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.users', 'card_photo_url', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.users', 'card_photo_box', 'SELECT') THEN
    RAISE EXCEPTION '220 ABORTED: anon cannot read handle or the card photo; /i/<handle> would not resolve.';
  END IF;
  IF has_column_privilege('anon', 'public.users', 'card_photo_rejects', 'SELECT')
     OR has_column_privilege('authenticated', 'public.users', 'card_photo_rejects', 'SELECT') THEN
    RAISE EXCEPTION '220 ABORTED: a client role can read card_photo_rejects; it is a moderation list.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.users'::regclass
                    AND tgname = 'users_card_photo_rejects_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '220 ABORTED: the card_photo_rejects guard trigger is missing.';
  END IF;
  IF to_regclass('public.users_handle_key') IS NULL THEN
    RAISE EXCEPTION '220 ABORTED: the unique index on users.handle is missing.';
  END IF;
  SELECT count(*) INTO v_prefilled FROM public.users WHERE handle IS NOT NULL;
  RAISE NOTICE '220: % handles set (prefilled from username where it fits).', v_prefilled;
END $$;

INSERT INTO public.migrations_applied (migration, note)
VALUES ('220_t_share1_card_photo_and_handle',
        'T-SHARE1 Part C: users.card_photo_url, card_photo_box, card_photo_rejects (admin-only), handle (unique)')
ON CONFLICT (migration) DO NOTHING;

COMMIT;
