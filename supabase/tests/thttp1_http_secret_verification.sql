-- T-HTTP1 verification + Vault runbook.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RUNBOOK — do these IN ORDER. The migration reads the secrets from Vault, so
-- the secrets must exist BEFORE migration 111 runs or notifications break.
--
--   STEP 1 (before the migration): store the CURRENT secret values in Vault.
--     Copy the current values out of the existing live objects:
--       * chat_webhook_secret  = the x-webhook-secret literal in the
--         'chat-message-notifications' trigger definition.
--       * push_send_bearer     = the Bearer token (without the "Bearer " prefix)
--         in send_push_notification_webhook's definition.
--     Then run (replace the placeholders — these values are NOT committed):
--
--       select vault.create_secret('<CURRENT_CHAT_WEBHOOK_SECRET>', 'chat_webhook_secret');
--       select vault.create_secret('<CURRENT_PUSH_SEND_BEARER>',    'push_send_bearer');
--
--   STEP 2: apply migration 111 (removes the literals; triggers now read Vault).
--
--   STEP 3: run the verification block at the bottom of this file — expect all PASS.
--
--   STEP 4 (LATER, optional rotation — zero secret in the repo either way):
--     Generate a NEW chat webhook secret. Update it in BOTH places, close together:
--       * Vault:  select vault.update_secret((select id from vault.secrets where name='chat_webhook_secret'), '<NEW_SECRET>');
--       * Vercel: set env WEBHOOK_SECRET = <NEW_SECRET> and redeploy.
--     (Rotating the service_role-based push bearer is heavier — it's the project
--      service key. Leave as-is for now; replacing it with a dedicated token is a
--      T-PUSH1 follow-up that also touches /api/push/send.)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The verification below is pure catalog reads (no writes, no secret values
-- printed). Run in the Supabase SQL editor AFTER migration 111. All rows PASS.

CREATE OR REPLACE FUNCTION pg_temp._thttp1_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE d text;
BEGIN
  -- 1-3: the three previously-synchronous functions are now async (net.http_post,
  --      no extensions.http).
  FOR d IN SELECT unnest(ARRAY['notify_join_request','notify_join_accepted','notify_new_message']) LOOP
    check_name := d || ' is async (net.http_post, no extensions.http)';
    result := CASE WHEN pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname = d AND pronamespace='public'::regnamespace)) LIKE '%net.http_post%'
                    AND pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname = d AND pronamespace='public'::regnamespace)) NOT LIKE '%extensions.http%'
                   THEN 'PASS' ELSE 'FAIL' END;
    RETURN NEXT;
  END LOOP;

  -- 4: notify_new_message reads sessions.title (the name column bug is fixed)
  check_name := 'notify_new_message uses sessions.title (name bug fixed)';
  result := CASE WHEN pg_get_functiondef('public.notify_new_message'::regproc) LIKE '%title INTO session_name%'
                 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- 5: no hardcoded Bearer JWT literal remains in any of these functions
  check_name := 'no hardcoded Bearer JWT literal in the push/chat functions';
  result := CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE pronamespace='public'::regnamespace
        AND proname IN ('send_push_notification_webhook','notify_chat_message_webhook')
        AND pg_get_functiondef(oid) LIKE '%Bearer eyJ%'
    ) THEN 'PASS' ELSE 'FAIL (a JWT literal is still present)' END;
  RETURN NEXT;

  -- 6: both secret-bearing functions read from Vault
  check_name := 'push + chat webhooks read their secret from Vault';
  result := CASE WHEN pg_get_functiondef('public.send_push_notification_webhook'::regproc) LIKE '%vault.decrypted_secrets%'
                  AND pg_get_functiondef('public.notify_chat_message_webhook'::regproc) LIKE '%vault.decrypted_secrets%'
                 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- 7: the chat webhook trigger was replaced (old supabase_functions webhook gone)
  check_name := 'chat webhook trigger replaced (no literal-secret supabase webhook)';
  result := CASE WHEN EXISTS (
                   SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                   WHERE c.relname='chat_messages' AND t.tgname='chat_message_webhook')
                  AND NOT EXISTS (
                   SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                   WHERE c.relname='chat_messages' AND t.tgname='chat-message-notifications')
                 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- 8: both Vault secrets exist (values never read/printed)
  check_name := 'both Vault secrets present (chat_webhook_secret, push_send_bearer)';
  result := CASE WHEN (SELECT count(*) FROM vault.secrets WHERE name IN ('chat_webhook_secret','push_send_bearer')) = 2
                 THEN 'PASS' ELSE 'FAIL (run STEP 1 of the runbook first)' END;
  RETURN NEXT;
END $$;

SELECT * FROM pg_temp._thttp1_verify();
