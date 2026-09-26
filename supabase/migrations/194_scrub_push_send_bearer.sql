-- 194_scrub_push_send_bearer.sql
--
-- Removes the orphaned `push_send_bearer` Vault secret.
--
-- WHY THIS EXISTS
-- The value stored under vault name 'push_send_bearer' is the project's master
-- service_role JWT. It was the Authorization: Bearer token for the
-- send_push_notification_webhook DB trigger, which POSTed to
-- https://tribe-v3.vercel.app/api/push/send.
--
--   * T-HTTP1 / migration 111 (PR #89) moved that value OUT of the trigger
--     definition into Supabase Vault, closing the catalog exposure. The value
--     itself was not rotated: it is still the service_role key.
--   * Migration 136 (PR #125) then retired the whole dead push path. It dropped
--     send_push_notification_webhook() -- the ONLY reader of push_send_bearer
--     (migration 111, line 132) -- along with the three Edge Function triggers.
--     /api/push/send never existed; live it 308->307->405'd through middleware
--     to /auth. 136 deliberately left the Vault secret alone ("one concern per
--     migration", 136 header lines 33-35), which is this migration's concern.
--
-- So after 136 the secret has zero readers and its value is the service_role
-- key sitting in Vault for no purpose. This removes it. That fully closes the
-- original T-PUSH1 concern -- "stop using the service_role key as the push auth
-- token" -- without reviving the dead route or minting a replacement token:
-- there is nothing left to authorize.
--
-- Provenance (proven, not assumed):
--   * grep over supabase/migrations: push_send_bearer is read only inside
--     send_push_notification_webhook() (111:132). No other function, trigger,
--     view or default names it.
--   * chat_webhook_secret is a SEPARATE Vault secret, still read by the KEPT
--     notify_chat_message_webhook(); it is NOT touched here.
--
-- NOT rotating the actual Supabase service_role project key -- that is a
-- separate decision (T-PUSH1). This only stops storing it as the push token.
--
-- ROBUSTNESS
-- Vault (the supabase_vault extension, schema `vault`) is present in every Tribe
-- environment -- prod, and the local Supabase stack that 111's webhook functions
-- already depend on. Even so, the secret is touched only through EXECUTE, so
-- this migration parses and runs as a clean no-op on any database where the
-- `vault` schema happens to be absent (a bare rebuild), rather than erroring on
-- an unresolved relation.

DO $$
DECLARE
  v_reader       regprocedure := to_regprocedure('public.send_push_notification_webhook()');
  v_vault        boolean      := to_regclass('vault.secrets') IS NOT NULL;
  v_existed      boolean      := false;
  v_still        boolean      := false;
BEGIN
  -- PREFLIGHT 1: the only reader of push_send_bearer was
  -- send_push_notification_webhook(), dropped by migration 136. If it is still
  -- present, 136 has not been applied on this database and scrubbing the secret
  -- now would pull the bearer out from under a trigger that still fires. Apply
  -- 136 first. (A fresh rebuild replays 108/111 then 136, leaving it absent, so
  -- this passes there.)
  IF v_reader IS NOT NULL THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: send_push_notification_webhook() still exists -- migration 136 has not been applied here. Apply 136 (retire the dead push triggers) before scrubbing push_send_bearer.';
  END IF;

  -- PREFLIGHT 2: nothing else may read push_send_bearer. prosrc is the raw
  -- function-body text (a catalog column, so no evaluation can error). If any
  -- live function body still names the secret, the mapping this migration relies
  -- on is wrong -- stop rather than break a live reader.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE prosrc LIKE '%push_send_bearer%') THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: a live function body still references push_send_bearer; refusing to scrub. Investigate the new reader before removing the secret.';
  END IF;

  -- The scrub. Only 'push_send_bearer'; chat_webhook_secret is untouched.
  IF v_vault THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = $1)'
      INTO v_existed USING 'push_send_bearer';

    EXECUTE 'DELETE FROM vault.secrets WHERE name = $1' USING 'push_send_bearer';

    -- POSTFLIGHT: separate command, so it sees the DELETE's effect.
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = $1)'
      INTO v_still USING 'push_send_bearer';

    IF v_still THEN
      RAISE EXCEPTION 'POSTFLIGHT FAILED: push_send_bearer is still present after DELETE.';
    END IF;
  END IF;

  RAISE NOTICE 'push_send_bearer scrub: vault_present=%, existed_before=%, present_after=%',
    v_vault, v_existed, v_still;

  -- The SQL editor discards RAISE NOTICE, so stash the outcome for the visible
  -- SELECT below (CLAUDE.md: end a hand-run data migration with a verification
  -- SELECT). Reading from this temp table -- not vault.secrets -- keeps the
  -- final statement parseable on a database with no vault schema.
  CREATE TEMP TABLE _scrub_194_result ON COMMIT DROP AS
    SELECT v_vault   AS vault_present,
           v_existed AS secret_existed_before,
           v_still   AS secret_present_after;
END $$;

-- Visible confirmation. Expect one row: secret_present_after = false.
SELECT * FROM _scrub_194_result;
