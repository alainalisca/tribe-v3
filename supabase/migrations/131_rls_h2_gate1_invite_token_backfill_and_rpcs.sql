-- 131_rls_h2_gate1_invite_token_backfill_and_rpcs.sql
-- RLS-H2 GATE 1 (additive). Backfills the drifted invite_tokens table (live-only,
-- no repo record) + adds the definer RPCs the reroute will move onto. Nothing
-- dropped; the qual:true "Anyone can view invite tokens" policy is removed in Gate 3.

-- ── 1. Backfill: CREATE TABLE matching the live definition EXACTLY ─────────────
-- IF NOT EXISTS -> pure no-op on prod (table exists; nothing dropped or altered),
-- real on a from-scratch rebuild. 4 constraints + both column defaults, verbatim.
-- The correctly-scoped INSERT policy is included (also live + unrecorded). The
-- qual:true SELECT policy is deliberately NOT recreated here — it is the vuln, and
-- reads move to validate_invite_token; a fresh rebuild should never have it.
CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id         uuid        NOT NULL DEFAULT uuid_generate_v4(),
  session_id uuid        NOT NULL,
  token      text        NOT NULL,
  created_by uuid        NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + '7 days'::interval),
  CONSTRAINT invite_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT invite_tokens_token_key UNIQUE (token),
  CONSTRAINT invite_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE,
  CONSTRAINT invite_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE
);

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;  -- idempotent

-- Correctly-scoped INSERT policy (live + unrecorded). Guarded so it is a no-op on
-- prod (policy already exists) and created on a fresh rebuild.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='invite_tokens'
      AND policyname='Session creators can create invite tokens'
  ) THEN
    CREATE POLICY "Session creators can create invite tokens"
      ON public.invite_tokens FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.sessions
                WHERE sessions.id = invite_tokens.session_id
                  AND sessions.creator_id = auth.uid())
      );
  END IF;
END$$;

-- ── 2. validate_invite_token — possessing the token IS the authorization ───────
-- Keyed on the token; returns the session data + validity as owner. Enumeration is
-- impossible (no token in hand => nothing). Replaces the anon table reads.
CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE v_row public.invite_tokens%ROWTYPE; v_session jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO v_row FROM public.invite_tokens WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired', 'session_id', v_row.session_id);
  END IF;
  SELECT to_jsonb(s) INTO v_session FROM public.sessions s WHERE s.id = v_row.session_id;
  RETURN jsonb_build_object(
    'valid', true,
    'session_id', v_row.session_id,
    'created_by', v_row.created_by,
    'expires_at', v_row.expires_at,
    'session', v_session
  );
END;
$$;
REVOKE ALL ON FUNCTION public.validate_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_invite_token(text) TO anon, authenticated;  -- anon: the acceptance page is public

-- ── 3. create_session_invite — crypto-strong token, generated SERVER-SIDE ──────
-- Replaces the client-side Math.random() in useSessionDetail.generateInviteLink.
-- Definer + explicit creator check (the INSERT policy also scopes it, but the
-- function does not trust the client). gen_random_uuid() is crypto-secure (122-bit,
-- pg_catalog — no pgcrypto search_path dependency); hyphens stripped for a clean
-- URL-safe token. Returns the token to its creator only.
CREATE OR REPLACE FUNCTION public.create_session_invite(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_token text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions WHERE id = p_session_id AND creator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized to create an invite for this session' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_token := replace(gen_random_uuid()::text, '-', '');   -- 32 hex chars, crypto-secure
  INSERT INTO public.invite_tokens (session_id, token, created_by)
  VALUES (p_session_id, v_token, auth.uid());
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.create_session_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_invite(uuid) TO authenticated;
