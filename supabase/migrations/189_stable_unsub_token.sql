-- 189_stable_unsub_token.sql
--
-- A per-user unsubscribe token, so RECURRING email can carry a link.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY 188'S TOKEN IS NOT ENOUGH, ONE MIGRATION LATER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 188 put unsub_token on one_off_sends, keyed by (campaign, user_id, channel).
-- That is exactly right for a one-off campaign and useless for anything that
-- sends repeatedly: the weekly recap has no campaign row to hang a token on,
-- and minting one per send would put a different unsubscribe URL in every
-- email a person ever receives.
--
-- Worse, it would be a SECOND unsubscribe mechanism. This repo's own record on
-- that is unambiguous -- SPORTS_LIST in five modules, two translation maps for
-- the same 23 keys, three hand-kept copies of the applied-migration list. The
-- second copy is the one that goes stale, and here going stale means a link in
-- somebody's inbox that no longer turns their email off.
--
-- So the token moves to the person. One row in notification_preferences, one
-- stable URL, every email in the app can carry it, and /api/unsubscribe has a
-- single thing to resolve.
--
-- 188's column is left in place and commented as superseded rather than
-- dropped: additive first, destructive last, and it has never been written to
-- in production because the campaign has not run. Dropping it is a separate
-- cleanup with nothing depending on the timing.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY A BEARER TOKEN AND NOT A SIGNATURE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- An HMAC would need a secret to exist in the environment before any email
-- could go out, and a secret that is missing at send time fails in the
-- direction of not sending. A stored random token needs nothing configured.
--
-- Its whole authority is "turn this person's email off", which is the
-- direction of caution: the damage from a leaked unsubscribe token is that
-- somebody stops receiving mail they can re-enable in settings. Compare the
-- invite tokens in 185, where the damage from a leak is joining a private
-- session as somebody else.
--
-- 128 bits from gen_random_uuid(), which is built into PG13+ so no extension
-- has to be present for the default to work.

-- ── 1. The token ───────────────────────────────────────────────────────────
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS unsub_token text;

-- Default for rows created from here on. Set separately from ADD COLUMN so a
-- re-run on a table that already has the column still installs the default.
ALTER TABLE public.notification_preferences
  ALTER COLUMN unsub_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');

-- Backfill every existing row. gen_random_uuid() is VOLATILE, so this produces
-- a distinct value per row rather than one value for the whole UPDATE -- which
-- is the failure mode that would give every user the same unsubscribe link.
UPDATE public.notification_preferences
   SET unsub_token = replace(gen_random_uuid()::text, '-', '')
 WHERE unsub_token IS NULL;

-- UNIQUE only after the backfill: a partial-unique index over NULLs would have
-- permitted the rows this just filled.
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_unsub_token_key
  ON public.notification_preferences (unsub_token);

COMMENT ON COLUMN public.notification_preferences.unsub_token IS
  'Stable per-user unsubscribe credential, used by EVERY email this app sends. '
  'A bearer token, not a signature: it needs no secret configured, and its '
  'only authority is to stop this person''s email, which they can re-enable in '
  'settings. Resolved by /api/unsubscribe, which sets email_unsubscribed_at.';

COMMENT ON COLUMN public.one_off_sends.unsub_token IS
  'SUPERSEDED BY notification_preferences.unsub_token (migration 189) and never '
  'written in production. A per-campaign token cannot serve recurring email, '
  'and two unsubscribe mechanisms means one of them going stale in somebody''s '
  'inbox. Left in place rather than dropped: additive first, destructive last.';

-- ── 2. Guards ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rows     bigint;
  v_filled   bigint;
  v_distinct bigint;
BEGIN
  SELECT count(*), count(unsub_token), count(DISTINCT unsub_token)
    INTO v_rows, v_filled, v_distinct
    FROM public.notification_preferences;

  -- NON-VACUITY FIRST. On an empty table every assertion below is true, and
  -- 151 backfilled a row for every auth user, so empty means something broke.
  IF v_rows = 0 THEN
    RAISE EXCEPTION
      '189 ABORTED: notification_preferences is empty. 151 backfilled a row per '
      'auth user, so the checks below would pass over nothing.';
  END IF;

  IF v_filled <> v_rows THEN
    RAISE EXCEPTION
      '189 ABORTED: % of % rows have no unsub_token, so those users would get '
      'an email with a dead unsubscribe link.', v_rows - v_filled, v_rows;
  END IF;

  -- THE ARM THAT MATTERS. If gen_random_uuid() had been evaluated once for the
  -- whole UPDATE, every row would share a token and one person clicking
  -- unsubscribe would resolve to somebody else entirely.
  IF v_distinct <> v_rows THEN
    RAISE EXCEPTION
      '189 ABORTED: % rows share % distinct tokens. One token per person, or '
      'an unsubscribe click resolves to the wrong user.', v_rows, v_distinct;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public'
                    AND indexname='notification_preferences_unsub_token_key') THEN
    RAISE EXCEPTION '189 ABORTED: the unique index on unsub_token is missing.';
  END IF;

  -- A new row must get its own token without the application supplying one,
  -- or the signup trigger from 150 produces users with a dead link. Checked by
  -- reading the installed default rather than by inserting a probe row.
  IF (SELECT pg_get_expr(d.adbin, d.adrelid)
        FROM pg_attrdef d
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
       WHERE d.adrelid = 'public.notification_preferences'::regclass
         AND a.attname = 'unsub_token') IS NULL THEN
    RAISE EXCEPTION
      '189 ABORTED: unsub_token has no DEFAULT, so rows created by 150''s '
      'signup trigger would have none.';
  END IF;

  RAISE NOTICE '189: % rows, % distinct tokens.', v_rows, v_distinct;
END $$;

-- ── 3. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('189_stable_unsub_token', 'per-user unsubscribe token; 188 one_off_sends.unsub_token superseded')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT count(*) FROM public.notification_preferences)                        AS preference_rows,
  (SELECT count(unsub_token) FROM public.notification_preferences)              AS rows_with_token,
  (SELECT count(DISTINCT unsub_token) FROM public.notification_preferences)     AS distinct_tokens,
  (SELECT count(*) = count(unsub_token) AND count(*) = count(DISTINCT unsub_token)
     FROM public.notification_preferences)                                      AS one_token_per_person_ok,
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
           AND indexname='notification_preferences_unsub_token_key')            AS unique_index_ok,
  (SELECT pg_get_expr(d.adbin, d.adrelid) IS NOT NULL
     FROM pg_attrdef d JOIN pg_attribute a
       ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE d.adrelid = 'public.notification_preferences'::regclass
      AND a.attname = 'unsub_token')                                            AS new_rows_get_a_token_ok,
  -- Still zero: nobody has had the chance to unsubscribe yet.
  (SELECT count(*) FROM public.notification_preferences
    WHERE email_unsubscribed_at IS NOT NULL)                                    AS unsubscribed_so_far;
