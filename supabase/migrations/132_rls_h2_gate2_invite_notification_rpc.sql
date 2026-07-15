-- 132_rls_h2_gate2_invite_notification_rpc.sql
-- RLS-H2 GATE 2 (additive). The caller-scoped RPC that resolves a session_invite
-- notification tap to its invite token, WITHOUT reading invite_tokens directly and
-- WITHOUT copying the token into the notifications table (decision (a) — the token
-- lives in exactly one place behind one gate).
--
-- Scope: the caller must be the RECIPIENT of a session_invite notification for the
-- session. That notification (minted by /api/invites/session) is the proof of
-- invitation; only then does the function return the session's latest unexpired
-- token. Any authenticated user without such a notification gets 42501.
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
      AND entity_id = p_session_id::text
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
