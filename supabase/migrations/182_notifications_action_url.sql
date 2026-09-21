-- 182_notifications_action_url.sql
--
-- Gives a notification somewhere to point that is not an entity id.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE BUG THIS EXISTS FOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- /api/invites/session mints an invite token, stores it, and NEVER DELIVERS IT.
-- createNotification accepts exactly recipient_id, actor_id, type, entity_type,
-- entity_id and message -- there is no field that can carry a token, and the
-- route never puts it in the message body either.
--
-- So the recipient gets "X invited you to a session" pointing at the SESSION,
-- and for an invite_only session a tokenless join is refused. The route's own
-- comment says as much:
--
--   "Without a token the invite is a dead end (invite_only sessions reject
--    tokenless joins), so failure here fails the request."
--
-- Minting a token nobody receives does not fix that dead end. Every card invite
-- also leaves an orphan invite_tokens row that expires unused after 7 days.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY NOT REUSE entity_id
-- ═══════════════════════════════════════════════════════════════════════════
--
-- notifications.entity_id is UUID. An invite token is randomBytes(16).hex --
-- 32 hex characters, no dashes -- which is not a valid uuid literal, so the
-- insert would fail outright.
--
-- THIS HAS ALREADY BEEN HIT ONCE. Migration 133 exists only because 132
-- assumed entity_id was text, having been misled by the generated TypeScript
-- type `string | null`. Its header says so in the first two lines. The type is
-- the same today; the column is still uuid.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THERE IS NO GRANT STATEMENT, AND WHY IT IS ASSERTED ANYWAY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- public.users is under COLUMN-LEVEL select grants (066/067), so a new column
-- there is invisible until named -- the failure that produced migration 157,
-- where onboarding_completed_at and dismissed_banners silently killed the
-- first-run introduction, five banners and the What's New badge.
--
-- public.notifications is NOT under that regime. No migration revokes its
-- table-level SELECT, so a column added here is readable immediately.
--
-- That is a claim about the live database, so the guard CHECKS it rather than
-- trusting the reasoning, using has_column_privilege -- the capability
-- question -- rather than information_schema.column_privileges, which only
-- reports whether a row happens to say so and cannot see table-level grants.
-- If the assertion fires, the remedy is one GRANT and it is in the message,
-- but widening the notifications read surface is a decision for a human.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS action_url text;

COMMENT ON COLUMN public.notifications.action_url IS
  'Optional in-app destination for this notification, e.g. /invite/<token>. '
  'Exists because entity_id is uuid and cannot carry a token. NULL means the '
  'reader falls back to the entity_type/entity_id destination as before.';

-- ── Guard ───────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_exists  boolean;
  v_is_text boolean;
  v_auth    boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'notifications'
       AND column_name = 'action_url'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION '182 ABORTED: action_url was not created.';
  END IF;

  -- text, NOT uuid. The whole reason this column exists is that entity_id is
  -- uuid and a hex token will not fit in one.
  SELECT data_type = 'text' INTO v_is_text
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'notifications'
     AND column_name = 'action_url';

  IF NOT v_is_text THEN
    RAISE EXCEPTION
      '182 ABORTED: action_url is not text. It carries /invite/<token>, and a '
      'token is 32 hex characters -- not a uuid. That confusion is what made '
      'migration 133 necessary.';
  END IF;

  v_auth := has_column_privilege('authenticated', 'public.notifications', 'action_url', 'SELECT');
  IF NOT v_auth THEN
    RAISE EXCEPTION
      '182 ABORTED: authenticated cannot SELECT notifications.action_url. This '
      'table was believed to be under table-level grants; it is not. Remedy: '
      'GRANT SELECT (action_url) ON public.notifications TO authenticated; -- '
      'but widening the notifications read surface is a human decision, so '
      'this migration raises rather than granting.';
  END IF;

  RAISE NOTICE '182: notifications.action_url added (text, readable by authenticated).';
END $$;

-- ── Verification. Every *_ok must read true. ────────────────────────────────
SELECT
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='action_url')
                                                                      AS action_url_type,
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='entity_id')
                                                                      AS entity_id_type_for_contrast,
  coalesce((SELECT data_type = 'text' FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='action_url'), false)
                                                                      AS action_url_is_text_ok,
  has_column_privilege('authenticated','public.notifications','action_url','SELECT')
                                                                      AS authenticated_can_read_ok,
  (SELECT count(*) FROM public.notifications WHERE action_url IS NOT NULL)
                                                                      AS rows_with_action_url;
