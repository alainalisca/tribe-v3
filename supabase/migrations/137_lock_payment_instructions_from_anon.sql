-- 137_lock_payment_instructions_from_anon.sql
--
-- ══════════════════════════════════════════════════════════════════════════
-- STOP — READ BEFORE RUNNING. This migration BREAKS PRODUCTION if applied
-- before the accompanying code is deployed.
--
-- After the revoke, any anon read that NAMES payment_instructions, or uses
-- select=*, returns 42501 permission denied. Until the code ships, the live
-- app still does exactly that, and applying this 401s:
--     /session/[id]            public session page, logged-out visitors
--     /i/[id]                  public instructor share page
--     /api/generate-calendar   the .ics download
--
-- This is not hypothetical: it happened on 2026-07-22, when the migration was
-- applied before the code. Recovery was `GRANT SELECT ON public.sessions TO
-- anon;`, which restores the table grant and undoes this file.
--
-- Once PR #128 is merged AND the Vercel deploy has finished, UNCOMMENT the
-- following line and re-run this file:
--
-- SELECT set_config('tribe.deploy_confirmed', 'yes', false);
--
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT AND WHY
--
-- sessions.payment_instructions is voluntary free-text where instructors write
-- how to pay them offline — in practice Nequi/Daviplata handles, phone numbers
-- and bank accounts. The audit found 23 rows populated, 11 naming a Colombian
-- payment rail, 6 containing a 7+ digit run.
--
-- public.sessions is world-readable: sessions_select_policy is {public} with
-- USING true, and anon holds the table SELECT grant. Those payment details were
-- readable by anyone with the publishable anon key, and /session/[id] (a PUBLIC
-- route, middleware.ts:54) rendered them on screen to logged-out visitors.
--
-- This migration is the enforcement backstop and lands LAST of four steps:
--   1. UI gate   — the block renders only for the host or a participant
--   2. DAL split — the column left the default select lists and moved to
--                  fetchSessionPaymentInstructions (host/participant only), so
--                  the public page payload no longer carries it
--   2b. wildcards — the two anon-reachable select=* on sessions were converted
--                  to explicit columns (generate-calendar, /i/[id])
--   3. this revoke — the database stops serving the column to anon at all
--
-- Pattern is 065/066, NOT a bare column revoke. A column-level REVOKE is a
-- silent no-op while a table-level grant exists — the trap that produced
-- migration 129's false PASS and needed 130 to repair. So: drop the table
-- grant, then grant back per column.
--
-- Deliberate consequence: anon select=* on sessions now returns 42501, because
-- * expands to include the revoked column. Verified against public.users, which
-- already has this treatment — anon select=id returns 200 while select=*
-- returns 42501, and count/head does not exempt it.
--
-- Scope: `authenticated` deliberately RETAINS SELECT on the column. The agreed
-- threat model is excluding anonymous scraping and public-page rendering, not
-- secrecy among logged-in users. The host/participant rule is enforced in the
-- DAL, which is a correctness gate, not a boundary against a logged-in user
-- issuing their own query. Revisit if real in-app payments are processed.
--
-- NOT touched — separate RLS-H4 view ticket, needs product decisions: exact
-- coordinates (99 rows, up to 14 decimal places), creator_id, the two
-- anon-readable invite_only session rows, and the internal moderation/ops
-- columns.

-- ── PREFLIGHT ────────────────────────────────────────────────────────────
-- Refuses to run unless the operator has explicitly attested the deploy is
-- live. Postgres cannot synchronously observe Vercel (pg_net is async, and
-- pg_stat_statements records normalised text without a role and without
-- recency), so an automatic check here would be able to report "safe" when it
-- is not. An explicit opt-in that cannot be satisfied by reflex is the honest
-- guard: paste-and-Run aborts.
DO $$
BEGIN
  IF coalesce(current_setting('tribe.deploy_confirmed', true), '') <> 'yes' THEN
    RAISE EXCEPTION
      E'PREFLIGHT BLOCKED — migration 137 was NOT applied.\n'
      '  It revokes anon SELECT on sessions.payment_instructions.\n'
      '  Until the code is deployed, anon reads still name that column and will 401:\n'
      '    - /session/[id]            public session page, logged-out visitors\n'
      '    - /i/[id]                  public instructor share page\n'
      '    - /api/generate-calendar   the .ics download\n'
      '  Required first: PR #128 merged AND the Vercel deploy finished.\n'
      '  Then uncomment the set_config line in this file''s header and re-run.';
  END IF;
END $$;

-- ── THE REVOKE ───────────────────────────────────────────────────────────
REVOKE SELECT ON public.sessions FROM anon;

-- 49 of the 50 LIVE columns. Enumerated from the live catalog, not the
-- generated types: lib/database.types.ts declares only 47 and would have
-- silently dropped community_id, early_access_only_until and waitlist_count,
-- breaking any anon read that names them.
GRANT SELECT (
  community_id, created_at, creator_id, currency,
  current_participants, date, description, duration,
  early_access_only_until, end_time, equipment, followup_sent,
  gender_preference, id, is_immediate, is_paid,
  is_recurring, is_training_now, join_policy, latitude,
  location, location_lat, location_lng, longitude,
  max_paid_spots, max_participants, payment_gateway, photo_verified,
  photos, platform_fee_percent, price_cents, recap_photos,
  recurrence_days, recurrence_end_date, recurrence_pattern, recurring_parent_id,
  reminder_15min_sent, reminder_1hr_sent, reminder_sent, skill_level,
  sport, start_time, status, title,
  updated_at, verified_at, verified_by, visibility,
  waitlist_count
) ON public.sessions TO anon;

-- ── POSTFLIGHT ───────────────────────────────────────────────────────────
-- Machine-verified, unlike the preflight. Asserts the column is gone for anon
-- AND that the grant-back list is complete, so a column omitted by a typo
-- surfaces here instead of as a 401 on a public page.
DO $$
DECLARE
  v_orig text := current_user;
  v_cnt  int;
  v_cols text;
BEGIN
  IF has_column_privilege('anon','public.sessions','payment_instructions','SELECT') THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: anon still holds SELECT on payment_instructions';
  END IF;

  SELECT count(*), string_agg(attname, ', ')
    INTO v_cnt, v_cols
  FROM pg_attribute
  WHERE attrelid = 'public.sessions'::regclass
    AND attnum > 0 AND NOT attisdropped
    AND attname <> 'payment_instructions'
    AND NOT has_column_privilege('anon','public.sessions',attname,'SELECT');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: anon lost SELECT on % column(s): % — public pages would 401', v_cnt, v_cols;
  END IF;

  IF NOT has_column_privilege('authenticated','public.sessions','payment_instructions','SELECT') THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: authenticated lost SELECT on payment_instructions';
  END IF;

  -- Role-scoped, not a catalog lookup: migration 129's grid passed because a DO
  -- block runs as table owner. Actually BE anon and read.
  PERFORM set_config('role','anon', true);
  BEGIN
    EXECUTE 'SELECT id, title, location FROM public.sessions LIMIT 1';
    PERFORM set_config('role', v_orig, true);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', v_orig, true);
    RAISE EXCEPTION 'POSTFLIGHT FAILED: anon cannot read ordinary columns — public pages would 401';
  END;
END $$;
