-- 111_async_http_and_externalize_secrets.sql
-- T-HTTP1 (drift audit H2): (1) make the synchronous, transaction-blocking HTTP
-- triggers fire-and-forget, and (2) take the hardcoded secrets out of the
-- trigger definitions (read them from Supabase Vault at runtime instead).
--
-- LIVE DIAGNOSIS (bodies fetched from prod before writing):
--   SYNCHRONOUS (extensions.http() — blocks the writing transaction):
--     notify_join_request   (session_participants INSERT)
--     notify_join_accepted  (session_participants UPDATE)
--     notify_new_message    (messages INSERT) — worst: one blocking POST PER
--                           confirmed participant, in a loop; also had a
--                           sessions.name column bug (sessions has `title`).
--   ALREADY ASYNC but with a hardcoded secret in the trigger:
--     send_push_notification_webhook  (push_notifications INSERT) — hardcoded
--                           Supabase service_role JWT as an Authorization Bearer.
--     chat-message-notifications (chat_messages INSERT) — a supabase_functions
--                           webhook whose x-webhook-secret is a literal in the
--                           trigger definition.
--
-- FIX:
--   * The three synchronous functions now use net.http_post (pg_net) — the
--     request is enqueued and the transaction returns immediately.
--   * notify_new_message: sessions.name -> sessions.title (was guaranteed to
--     throw), preserved otherwise.
--   * The two secret-bearing triggers now READ their secret from Vault
--     (vault.decrypted_secrets) at runtime — no literal in the catalog. The
--     chat webhook's supabase_functions.http_request trigger is replaced by a
--     custom async net.http_post that sends the identical Supabase webhook
--     payload ({type, table, schema, record, old_record}) so the endpoint
--     parses it unchanged.
--
-- NO trigger is retired and push is NOT moved into the app (that is T-PUSH1).
-- The service_role key is only moved out of the catalog — it is NOT rotated
-- here (project-wide op); replacing it with a dedicated token is a follow-up.
--
-- ─────────────────────────────────────────────────────────────────────────
-- PREREQUISITE (run BEFORE this migration; see the runbook in
-- supabase/tests/thttp1_http_secret_verification.sql): store the CURRENT secret
-- values in Vault under names 'chat_webhook_secret' and 'push_send_bearer', so
-- the rewritten triggers keep working. Rotation (new values in Vault + Vercel
-- WEBHOOK_SECRET) is a separate, later step. This migration contains NO secret.
-- ─────────────────────────────────────────────────────────────────────────

-- ── notify_join_request → async ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_join_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE session_data RECORD;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT s.id, s.title AS name, s.date, s.creator_id, u.name AS requester_name
      INTO session_data
      FROM sessions s JOIN users u ON u.id = NEW.user_id
      WHERE s.id = NEW.session_id;

    PERFORM net.http_post(
      url := 'https://twyplulysepbeypqralz.supabase.co/functions/v1/send-push-notification',
      body := jsonb_build_object(
        'recipientUserId', session_data.creator_id,
        'title', session_data.requester_name || ' wants to join',
        'body', session_data.name || ' on ' || session_data.date,
        'url', '/sessions/' || NEW.session_id,
        'sessionId', NEW.session_id,
        'type', 'join_request'
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  END IF;
  RETURN NEW;
END; $$;

-- ── notify_join_accepted → async ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_join_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE session_data RECORD;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status = 'pending') THEN
    SELECT s.id, s.title AS name, s.date, s.creator_id, u.name AS host_name
      INTO session_data
      FROM sessions s JOIN users u ON u.id = s.creator_id
      WHERE s.id = NEW.session_id;

    PERFORM net.http_post(
      url := 'https://twyplulysepbeypqralz.supabase.co/functions/v1/send-push-notification',
      body := jsonb_build_object(
        'recipientUserId', NEW.user_id,
        'title', 'You''re in! 🎉',
        'body', session_data.host_name || ' accepted your request for ' || session_data.name,
        'url', '/sessions/' || NEW.session_id,
        'sessionId', NEW.session_id,
        'type', 'request_accepted'
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  END IF;
  RETURN NEW;
END; $$;

-- ── notify_new_message → async + name→title fix ──────────────────────────
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE participant RECORD; sender_name TEXT; session_name TEXT;
BEGIN
  SELECT name INTO sender_name FROM users WHERE id = NEW.user_id;
  -- was: SELECT name FROM sessions  (no such column) -> sessions.title
  SELECT title INTO session_name FROM sessions WHERE id = NEW.session_id;

  FOR participant IN
    SELECT DISTINCT user_id FROM session_participants
    WHERE session_id = NEW.session_id AND user_id != NEW.user_id AND status = 'confirmed'
  LOOP
    PERFORM net.http_post(
      url := 'https://twyplulysepbeypqralz.supabase.co/functions/v1/send-push-notification',
      body := jsonb_build_object(
        'recipientUserId', participant.user_id,
        'title', sender_name || ' in ' || session_name,
        'body', substring(NEW.content, 1, 100),
        'url', '/sessions/' || NEW.session_id,
        'sessionId', NEW.session_id,
        'type', 'chat_message'
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  END LOOP;
  RETURN NEW;
END; $$;

-- ── send_push_notification_webhook → bearer from Vault ───────────────────
CREATE OR REPLACE FUNCTION public.send_push_notification_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bearer text;
BEGIN
  SELECT decrypted_secret INTO v_bearer FROM vault.decrypted_secrets WHERE name = 'push_send_bearer';
  PERFORM net.http_post(
    url := 'https://tribe-v3.vercel.app/api/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_bearer, '')
    ),
    body := jsonb_build_object('notificationId', NEW.id::text)
  );
  RETURN NEW;
END; $$;

-- ── chat webhook → custom async fn reading the secret from Vault ──────────
-- Replaces the supabase_functions.http_request webhook (which baked the secret
-- into the trigger definition). Sends the identical Supabase webhook payload.
CREATE OR REPLACE FUNCTION public.notify_chat_message_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'chat_webhook_secret';
  PERFORM net.http_post(
    url := 'https://tribe-v3.vercel.app/api/webhook/chat-message/',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'chat_messages',
      'schema', 'public',
      'record', row_to_json(NEW),
      'old_record', NULL
    )
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS "chat-message-notifications" ON public.chat_messages;
DROP TRIGGER IF EXISTS chat_message_webhook ON public.chat_messages;
CREATE TRIGGER chat_message_webhook
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_chat_message_webhook();
