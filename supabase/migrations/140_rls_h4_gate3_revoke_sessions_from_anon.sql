-- 140_rls_h4_gate3_revoke_sessions_from_anon.sql
--
-- ══════════════════════════════════════════════════════════════════════════
-- DRAFT — DO NOT APPLY YET. This is RLS-H4 Gate 3, the destructive step.
-- It is staged for review only. Al applies it, in a testing window, AFTER the
-- chat/edit guard code is merged and the Vercel deploy has finished.
-- As written it ABORTS on paste-and-run (the attestation line is commented).
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT AND WHY
--
-- This is the last gate of RLS-H4. Gate 1 (138) added sessions_public + the
-- reprojected validate_invite_token. Gate 2 (138, same PR / #134) rerouted every
-- anon reader onto the view. This gate revokes anon's SELECT on the base
-- public.sessions table entirely, so the view becomes the ONLY anon read path
-- and a newly-added sessions column is private by default instead of anon-
-- readable the instant it exists.
--
-- Unlike 137 (a column-level revoke that kept the table grant), this is a
-- TABLE-level revoke with NO grant-back. anon stops reading the base table at
-- all; sessions_public (owner-executed, security_invoker=false) keeps serving
-- the curated projection because it runs as its owner, not as anon.
--
-- authenticated is UNTOUCHED — it keeps full base-table SELECT (full-precision
-- coords, all columns). The threat model is anonymous scraping and public-page
-- rendering, not secrecy among logged-in users (same scope decision as 137).
--
-- ── PREREQUISITE CODE (must be deployed before this runs) ────────────────────
-- After the revoke, ANY anon read of the base table returns 42501. Audit
-- (2026-07-25) found exactly TWO anon-reachable base-table reads left after
-- #134, both via fetchSession (explicit column list, base table):
--     /session/[id]/chat   app/session/[id]/chat/page.tsx      (loadData)
--     /session/[id]/edit   app/session/[id]/edit/useEditSession (loadSession)
-- Both live under /session, which is a PUBLIC path (middleware.ts:54), so anon
-- reaches them with no server redirect. Their guard/reroute — skip the anon
-- fetchSession, require auth first — MUST be merged and deployed before this
-- gate. Every other anon session surface already reads sessions_public or a
-- SECURITY DEFINER RPC (/session/[id] anon path, /s/[id], /i/[id],
-- /api/generate-calendar, /invite/[token]); the chat-message webhook and all
-- crons use the service-role key, which bypasses grants.
--
-- ── PREFLIGHT ────────────────────────────────────────────────────────────
-- Same honest guard as 136/137: Postgres cannot synchronously observe Vercel,
-- so an automatic "is the code live?" check could report safe when it is not.
-- An explicit attestation that cannot be satisfied by reflex is the guard —
-- paste-and-Run aborts. Once the chat/edit guards are merged AND the Vercel
-- deploy has finished, UNCOMMENT the next line and re-run this file:
--
-- SELECT set_config('tribe.deploy_confirmed', 'yes', false);
--
DO $$
BEGIN
  IF coalesce(current_setting('tribe.deploy_confirmed', true), '') <> 'yes' THEN
    RAISE EXCEPTION
      E'PREFLIGHT BLOCKED — migration 140 (RLS-H4 Gate 3) was NOT applied.\n'
      '  It revokes anon SELECT on the whole public.sessions table.\n'
      '  Until the chat/edit guards are deployed, these anon reads still hit the\n'
      '  base table and will 401:\n'
      '    - /session/[id]/chat   (fetchSession in loadData)\n'
      '    - /session/[id]/edit   (fetchSession in loadSession)\n'
      '  Required first: the chat/edit guard PR merged AND the Vercel deploy finished.\n'
      '  Then uncomment the set_config line in this file''s header and re-run.';
  END IF;
END $$;

-- ── THE REVOKE ───────────────────────────────────────────────────────────
-- Whole-table, no grant-back. anon reads sessions_public from here on.
REVOKE SELECT ON public.sessions FROM anon;

-- ── POSTFLIGHT ───────────────────────────────────────────────────────────
-- Machine-verified. Asserts anon can no longer read the base table, that the
-- view still works for anon, and that authenticated kept its base-table SELECT.
DO $$
DECLARE
  v_orig text := current_user;
BEGIN
  -- 1. anon must have lost table-level SELECT on the base table.
  IF has_table_privilege('anon','public.sessions','SELECT') THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: anon still holds table SELECT on public.sessions';
  END IF;

  -- 2. authenticated must RETAIN base-table SELECT (host edit / detail depend on it).
  IF NOT has_table_privilege('authenticated','public.sessions','SELECT') THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: authenticated lost SELECT on public.sessions';
  END IF;

  -- 3. anon must STILL be able to read the view (the sole anon read path).
  IF NOT has_table_privilege('anon','public.sessions_public','SELECT') THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: anon lost SELECT on public.sessions_public (anon read path gone)';
  END IF;

  -- 4. Role-scoped proof, not a catalog lookup (a DO block runs as table owner,
  --    which is exactly what produced 129's false PASS). Actually BE anon:
  --    the base table must be denied, the view must succeed.
  PERFORM set_config('role','anon', true);
  BEGIN
    EXECUTE 'SELECT id FROM public.sessions LIMIT 1';
    PERFORM set_config('role', v_orig, true);
    RAISE EXCEPTION 'POSTFLIGHT FAILED: anon can STILL read public.sessions base table';
  EXCEPTION
    WHEN insufficient_privilege THEN
      -- expected: base table denied for anon. Now confirm the view still works.
      BEGIN
        EXECUTE 'SELECT id FROM public.sessions_public LIMIT 1';
        PERFORM set_config('role', v_orig, true);
      EXCEPTION WHEN insufficient_privilege THEN
        PERFORM set_config('role', v_orig, true);
        RAISE EXCEPTION 'POSTFLIGHT FAILED: anon cannot read sessions_public — anon pages would 401';
      END;
  END;
END $$;
