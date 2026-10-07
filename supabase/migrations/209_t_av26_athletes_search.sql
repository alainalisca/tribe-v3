-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV26
-- RENUMBERED: was 8208_t_av26_athletes_search.sql until 2026-10-06 (T-AV31). 8200 to 8209 became 201
--   to 210 at the merge gate, skipping 194, 195 and 200, which unmerged
--   branches already claim (Al's decision, docs/ATHLETE_VALUE_MERGE_GATE.md).
-- CREATES: av_athletes_search_candidates(uuid, text)
-- RISK: MEDIUM
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV26: "Add athlete" search for the gym dashboard
-- ════════════════════════════════════════════════════════════════════════════
--
-- 209 was free on origin/main (highest 198, d236656d), every branch, every
-- worktree and all history on 2026-10-01.
--
-- WHY A DEFINER FUNCTION. users.email is not selectable by authenticated
-- (T-SEC5), so an owner's own session cannot search by email any other way.
-- The function reads it and never returns it.
--
-- HOW IT AVOIDS BEING A "IS THIS PERSON ON TRIBE" LOOKUP (Al, decision 3)
--   * Owner or admin of p_partner_id only. Coaches, other gyms and strangers
--     get the same not_found an unknown partner gets.
--   * A query containing @ matches ONE full address exactly (lowercased
--     equality). Never a prefix, so addresses cannot be discovered by typing.
--   * Anything else is a name: at least 3 characters, matching the start of a
--     word in the name. LIKE wildcards in the query are escaped.
--   * At most 5 results, from users_discoverable only: deleted, banned and
--     test accounts never appear.
--   * 30 searches an hour per caller, counted in public.rate_limits. Only a
--     search that passes the checks above counts, so a typo does not spend it.
--   * A result is id, name and avatar_url. Never the email, never which field
--     matched: an email hit and a name hit look identical.
--   What remains, accepted by Al: an owner can confirm one exact address is
--   on Tribe, at most 30 times an hour.
--
-- VOLATILE, not STABLE: it writes the rate-limit row. rate_limits has RLS on
-- and no policy, so only the table owner (this function) and the service
-- role can touch it.

BEGIN;

CREATE OR REPLACE FUNCTION public.av_athletes_search_candidates(p_partner_id uuid, p_query text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_q       text := lower(btrim(coalesce(p_query, '')));
  v_role    text;
  v_key     text;
  v_like    text;
  v_results jsonb;
BEGIN
  -- Input checks that do not depend on any object run first.
  IF char_length(v_q) < 3 OR char_length(v_q) > 254 THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_short');
  END IF;

  v_role := public.av_my_partner_role(p_partner_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin')
     OR NOT EXISTS (SELECT 1 FROM public.athlete_programs WHERE partner_id = p_partner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  v_key := 'av_athletes_search:' || auth.uid()::text;
  IF (SELECT count(*) FROM public.rate_limits
       WHERE key = v_key AND created_at >= now() - interval '1 hour') >= 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited');
  END IF;
  INSERT INTO public.rate_limits (key) VALUES (v_key);

  IF position('@' in v_q) > 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'avatar_url', d.avatar_url)), '[]'::jsonb)
      INTO v_results
      FROM public.users_discoverable d
      JOIN public.users u ON u.id = d.id
     WHERE lower(btrim(u.email)) = v_q;
  ELSE
    v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'avatar_url', r.avatar_url)
                              ORDER BY r.name), '[]'::jsonb)
      INTO v_results
      FROM (SELECT d.id, d.name, d.avatar_url
              FROM public.users_discoverable d
             WHERE lower(d.name) LIKE v_like || '%'
                OR lower(d.name) LIKE '% ' || v_like || '%'
             ORDER BY d.name
             LIMIT 5) r;
  END IF;

  RETURN jsonb_build_object('success', true, 'results', v_results);
END;
$fn$;

REVOKE ALL ON FUNCTION public.av_athletes_search_candidates(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.av_athletes_search_candidates(uuid, text) TO authenticated;

DO $$
DECLARE
  v_fn constant text := 'public.av_athletes_search_candidates(uuid,text)';
BEGIN
  IF to_regprocedure(v_fn) IS NULL THEN
    RAISE EXCEPTION '209 ABORTED: % is missing.', v_fn;
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(v_fn))
     OR (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure(v_fn)) IS NULL THEN
    RAISE EXCEPTION '209 ABORTED: % must be SECURITY DEFINER with a pinned search_path.', v_fn;
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '209 ABORTED: % has the wrong grants.', v_fn;
  END IF;
  RAISE NOTICE '209: athlete search installed.';
END $$;

-- ── Record this migration as applied (T-AV31: renumbered into main's sequence,
--    so it records itself like every migration since 184) ─────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('209_t_av26_athletes_search', 'T-AV26: Add-athlete search (was 8208)')
ON CONFLICT (migration) DO NOTHING;

COMMIT;
