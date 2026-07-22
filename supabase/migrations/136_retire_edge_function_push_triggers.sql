-- 136_retire_edge_function_push_triggers.sql
--
-- Retires the dead parallel push system. Four triggers POST to the
-- send-push-notification Edge Function (or to a route that never existed).
-- None of them has ever delivered a notification:
--
--   on_join_request_created / on_join_accepted / on_message_sent
--     -> POST .../functions/v1/send-push-notification with
--        headers := jsonb_build_object('Content-Type','application/json')
--        and NO Authorization header (migration 111). A Supabase Edge Function
--        rejects that, so these cannot succeed. Structural, not a config slip.
--
--   send_push_notification_trigger
--     -> POST https://tribe-v3.vercel.app/api/push/send, which does not exist.
--        Live: 308 -> 307 Location: /auth?returnTo=%2Fapi%2Fpush%2Fsend%2F -> 405.
--        Middleware bounces it to the auth screen.
--
-- Everything they were meant to send is now delivered by the app path
-- (/api/notifications/send, CRON_SECRET bearer):
--   join request  -> lib/sessions.ts -> /api/sessions/notify-join
--   approval      -> /api/sessions/notify-approval (PR #123)
--   chat          -> chat_message_webhook, KEPT BY THIS MIGRATION
--
-- Provenance is proven, not assumed: the two systems write different copy, and
-- the approval push received on a real device read "Solicitud aprobada"
-- (app path), not "You're in! 🎉" (Edge Function). Exactly one push arrived.
--
-- Dependency sweep before writing this: pg_proc bodies, view definitions,
-- column defaults and RLS policies referencing any of the four -> 0 rows.
-- Repo sweep: zero references outside migrations. messages = 0 live rows;
-- chat_messages = 82 and stays on the kept trigger.
--
-- NOT touched here (one concern per migration): the dead `messages` table, the
-- push_send_bearer Vault secret, and the Edge Function itself. The Edge
-- Function is deleted in a separate PR, AFTER its source is committed.
--
-- ─────────────────────────────────────────────────────────────────────────
-- REVERSAL RECORD — verbatim pg_get_triggerdef() output, so these can be
-- recreated exactly. Not reconstructed by hand; read from the live catalog.
--
--   CREATE TRIGGER on_message_sent AFTER INSERT ON public.messages
--     FOR EACH ROW EXECUTE FUNCTION notify_new_message()
--
--   CREATE TRIGGER send_push_notification_trigger AFTER INSERT ON public.push_notifications
--     FOR EACH ROW EXECUTE FUNCTION send_push_notification_webhook()
--
--   CREATE TRIGGER on_join_accepted AFTER UPDATE ON public.session_participants
--     FOR EACH ROW EXECUTE FUNCTION notify_join_accepted()
--
--   CREATE TRIGGER on_join_request_created AFTER INSERT ON public.session_participants
--     FOR EACH ROW EXECUTE FUNCTION notify_join_request()
--
--   -- KEPT, recorded for completeness only; this migration does not touch it:
--   CREATE TRIGGER chat_message_webhook AFTER INSERT ON public.chat_messages
--     FOR EACH ROW EXECUTE FUNCTION notify_chat_message_webhook()
--
-- The functions themselves are recoverable from migrations 108 and 111.
-- ─────────────────────────────────────────────────────────────────────────

-- PREFLIGHT: fail loudly if live state differs from what was mapped. Without
-- this, a renamed trigger would make DROP ... IF EXISTS a silent no-op and the
-- migration would "succeed" while changing nothing.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(x.want || ' on ' || x.tbl, ', ')
    INTO v_missing
  FROM (VALUES
      ('on_message_sent',                'messages'),
      ('send_push_notification_trigger', 'push_notifications'),
      ('on_join_accepted',               'session_participants'),
      ('on_join_request_created',        'session_participants'),
      ('chat_message_webhook',           'chat_messages')
  ) AS x(want, tbl)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND c.relnamespace = 'public'::regnamespace
      AND t.tgname  = x.want
      AND c.relname = x.tbl
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: expected trigger(s) not found: %. Live drift differs from the mapped state; stopping before any drop.',
      v_missing;
  END IF;
END $$;

-- Triggers first, then functions. No CASCADE anywhere: the dependency sweep
-- returned 0, so CASCADE could only ever remove something we did not intend.
-- No IF EXISTS: a name that does not match must fail, not silently no-op.
DROP TRIGGER on_message_sent                ON public.messages;
DROP TRIGGER send_push_notification_trigger ON public.push_notifications;
DROP TRIGGER on_join_accepted               ON public.session_participants;
DROP TRIGGER on_join_request_created        ON public.session_participants;

DROP FUNCTION public.notify_new_message();
DROP FUNCTION public.send_push_notification_webhook();
DROP FUNCTION public.notify_join_accepted();
DROP FUNCTION public.notify_join_request();

-- POSTFLIGHT: the four are gone AND the chat path survived.
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal
    AND c.relnamespace = 'public'::regnamespace
    AND t.tgname IN ('on_message_sent','send_push_notification_trigger',
                     'on_join_accepted','on_join_request_created');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: % retired trigger(s) still present', v_cnt;
  END IF;

  IF to_regprocedure('public.notify_chat_message_webhook()') IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: notify_chat_message_webhook() was removed — chat push would break';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND c.relnamespace = 'public'::regnamespace
      AND t.tgname = 'chat_message_webhook' AND c.relname = 'chat_messages'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: chat_message_webhook trigger was removed — chat push would break';
  END IF;
END $$;
