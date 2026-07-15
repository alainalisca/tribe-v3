-- 133_rls_h2_gate2_invite_notification_rpc_fix.sql
-- Fix for migration 132. notifications.entity_id is UUID (the TS type string|null
-- misled us), so `entity_id = p_session_id::text` in 132 was a uuid = text
-- comparison that errors at runtime (no implicit cast). CREATE FUNCTION did not
-- catch it (plpgsql bodies aren't fully type-resolved until first execution) and
-- the grant check never ran the body — the BEGIN...ROLLBACK fixture exposed it.
--
-- Effect of the bug: every notification tap threw, and the client fell back to
-- /session/{id}, so invite recipients never reached the /invite/{token} acceptance
-- page. Corrected to a uuid = uuid comparison.
CREATE OR REPLACE FUNCTION public.get_invite_token_for_notification(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE v_token text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE recipient_id = auth.uid()
      AND type = 'session_invite'
      AND entity_type = 'session'
      AND entity_id = p_session_id     -- entity_id is uuid; compare uuid = uuid (was ::text)
  ) THEN
    RAISE EXCEPTION 'no invite notification for this session' USING ERRCODE = 'insufficient_privilege';  -- 42501
  END IF;

  SELECT token INTO v_token
  FROM public.invite_tokens
  WHERE session_id = p_session_id
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_token;  -- NULL when no live token remains; the client falls back to /session/{id}
END;
$$;
REVOKE ALL ON FUNCTION public.get_invite_token_for_notification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invite_token_for_notification(uuid) TO authenticated;
