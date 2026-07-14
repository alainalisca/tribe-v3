-- 129_rls_h3_gate3_lock_session_participants.sql
-- RLS-H3 GATE 3 (final): lock the raw session_participants table.
--
-- Gate 2 rerouted every anon/authenticated reader onto views + definer RPCs, so
-- the only remaining code reads are service-role (bypass RLS) and own-row
-- (user_id = auth.uid()) self reads. This migration makes the raw table match:
--   1. Drop EVERY FOR SELECT policy (the 3 qual:true "everyone" ones + any other),
--      name-independently — reads the LIVE catalog and drops by the real polname,
--      logging each so the apply output shows exactly which were removed (no guess).
--   2. Add ONE narrow read rule: authenticated may read ONLY their own rows.
--      Exactly user_id = auth.uid(). Nothing looser — a policy widened for
--      convenience is how conversation_participants became auth.uid() IS NOT NULL,
--      which was the DM vuln.
--   3. Revoke SELECT on the guest-PII columns from BOTH roles (defense in depth:
--      even the own-row policy can't surface guest_phone/email/token; the guest
--      RPCs read them as owner).
--   4. No anon SELECT policy at all -> anon gets ZERO rows from the raw table.
--
-- UPDATE/DELETE policies are NOT touched: host approve/kick keep working, and the
-- Gate 2 write rework (affected-row COUNT, no RETURNING) means those writes never
-- needed SELECT on a row the host doesn't own. RLS is already enabled.

-- ── 1. Drop all FOR SELECT policies (polcmd 'r') by their real, live names ──────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pol.polname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'session_participants'
      AND pol.polcmd = 'r'        -- SELECT-command policies only (not INSERT/UPDATE/DELETE/ALL)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.session_participants', r.polname);
    RAISE NOTICE 'gate3: dropped SELECT policy %', r.polname;
  END LOOP;
END$$;

-- ── 2. The ONE narrow read rule — exactly own rows, authenticated only ─────────
DROP POLICY IF EXISTS "sp_select_own" ON public.session_participants;
CREATE POLICY "sp_select_own" ON public.session_participants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── 3. Guest-PII columns: revoke SELECT from BOTH roles, no exceptions ─────────
REVOKE SELECT (guest_phone, guest_email, guest_token)
  ON public.session_participants FROM anon, authenticated;

-- No anon SELECT policy is created. With RLS enabled and no policy covering anon,
-- the anon role gets zero rows from the raw table. Reads go through
-- session_participants_public (counts) / session_participants_roster (identities,
-- authenticated) / the guest + payment definer RPCs.
