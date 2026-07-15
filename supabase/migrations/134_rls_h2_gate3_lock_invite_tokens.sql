-- 134_rls_h2_gate3_lock_invite_tokens.sql
-- RLS-H2 GATE 3 (final): lock the raw invite_tokens table. Gate 2 rerouted every
-- reader onto definer RPCs (validate_invite_token, get_invite_token_for_notification,
-- create_session_invite), so nothing legitimate reads the raw table anymore.
--
-- Two locks, because a SELECT needs BOTH an RLS policy AND a table grant:
--   1. Drop the qual:true SELECT policy (removes the row-level allow).
--   2. Revoke the table-level SELECT grant (this is what makes anon 401 instead of
--      an empty 200 — the RLS-129 lesson: a policy drop alone leaves the grant, and
--      a column revoke can't touch a table grant). FROM PUBLIC too, in case the
--      grant is held via PUBLIC rather than the role directly.
-- The INSERT policy + INSERT grant are left intact; the definer RPCs read as owner.

-- 1. Drop the SELECT policy by its real live name, then sweep any other SELECT policy.
DROP POLICY IF EXISTS "Anyone can view invite tokens" ON public.invite_tokens;
DO $$
DECLARE r record; v_all int;
BEGIN
  FOR r IN
    SELECT pol.polname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'invite_tokens' AND pol.polcmd = 'r'  -- SELECT only
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.invite_tokens', r.polname);
    RAISE NOTICE 'gate3: dropped SELECT policy %', r.polname;
  END LOOP;

  -- A FOR ALL ('*') policy would implicitly grant SELECT and survive a SELECT-only
  -- drop. None is expected (the live dump showed only the SELECT + INSERT policies),
  -- and it is NOT auto-dropped because ALL also covers INSERT. Surface it loudly.
  SELECT count(*) INTO v_all
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'invite_tokens' AND pol.polcmd = '*';
  IF v_all > 0 THEN
    RAISE WARNING 'gate3: % FOR ALL policy(ies) remain on invite_tokens — they implicitly grant SELECT; review manually', v_all;
  END IF;
END$$;

-- 2. Revoke the table-level SELECT grant from every non-owner role.
REVOKE SELECT ON public.invite_tokens FROM PUBLIC, anon, authenticated;

-- INSERT policy "Session creators can create invite tokens" + the INSERT grant are
-- untouched. All reads now go through the SECURITY DEFINER RPCs.
