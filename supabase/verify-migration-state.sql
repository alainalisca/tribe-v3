-- supabase/verify-migration-state.sql
--
-- One-shot script: paste into the Supabase SQL editor against the
-- PRODUCTION database to verify which Tribe.OS migrations (060–083)
-- have been applied. Returns a single result table with one row per
-- migration and a status of 'applied' or 'MISSING'.
--
-- This doesn't read supabase_migrations.schema_migrations directly
-- because not every migration in this repo was applied through the
-- Supabase CLI — some were run manually via psql or the SQL editor,
-- which leaves no audit row. Instead we check for the artifacts each
-- migration introduces (tables, functions, columns). That's the more
-- reliable signal of "did this run."
--
-- Run before merging `feature/tribe-os` → `main`. Any MISSING row is
-- a runtime time-bomb waiting for the first user to hit the surface
-- that depends on it.
--
-- Safe to re-run — pure SELECTs, no side effects.

select '060_tribe_os_premium' as migration,
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'users'
           and column_name = 'tribe_os_tier'
       ) then 'applied' else 'MISSING' end as status
union all
select '061_blocked_users',
       case when (select to_regprocedure('public.is_user_blocked(uuid,uuid)')) is not null
            then 'applied' else 'MISSING' end
union all
select '062_clients_and_attendance',
       case when (select to_regclass('public.clients')) is not null
              and (select to_regclass('public.client_attendance')) is not null
            then 'applied' else 'MISSING' end
union all
select '063_revenue_dashboard',
       case when (select to_regprocedure('public.instructor_revenue_totals(uuid,date,date,text)')) is not null
            then 'applied' else 'MISSING' end
union all
select '064_revenue_function_auth_assertion',
       -- Hardened the same functions; no separate artifact. We treat
       -- it as applied when 063 is applied (no way to distinguish in
       -- isolation). Run \df on instructor_revenue_totals to verify
       -- the SECURITY DEFINER flag if forensically interested.
       case when (select to_regprocedure('public.instructor_revenue_totals(uuid,date,date,text)')) is not null
            then 'applied (assumed via 063)' else 'MISSING' end
union all
select '065_users_sensitive_columns_revoke',
       -- Permissions revoke, no artifact. Spot-check by running:
       --   select has_table_privilege('authenticated','public.users','select')
       -- and comparing against the migration file.
       'cannot verify automatically'
union all
select '066_users_column_level_grants',
       'cannot verify automatically'
union all
select '067_users_push_token_revoke',
       'cannot verify automatically'
union all
select '068_gym_tenant_schema',
       case when (select to_regclass('public.gyms')) is not null
              and (select to_regclass('public.gym_coaches')) is not null
            then 'applied' else 'MISSING' end
union all
select '069_gym_tenant_backfill',
       -- Backfill; data-only. Check by seeing if any non-zero
       -- gym_coaches rows exist for known users.
       case when exists (select 1 from public.gym_coaches limit 1)
            then 'applied (rows present)' else 'MISSING or empty gym' end
union all
select '070_dual_path_rls',
       -- RLS policy changes; no artifact. Verify via pg_policies if needed.
       'cannot verify automatically'
union all
select '071_gym_revenue_functions',
       case when (select to_regprocedure('public.gym_revenue_totals(uuid,date,date,text)')) is not null
            then 'applied' else 'MISSING' end
union all
select '072_clients_member_enrichment',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'clients'
           and column_name = 'last_seen_at'
       ) then 'applied' else 'MISSING' end
union all
select '073_list_gym_coaches',
       case when (select to_regprocedure('public.list_gym_coaches(uuid)')) is not null
            then 'applied' else 'MISSING' end
union all
select '074_gym_teams',
       case when (select to_regclass('public.gym_teams')) is not null
              and (select to_regclass('public.gym_team_members')) is not null
            then 'applied' else 'MISSING' end
union all
select '075_intelligence_schema',
       case when (select to_regclass('public.training_partners')) is not null
              and (select to_regclass('public.community_insights')) is not null
              and (select to_regclass('public.community_insight_members')) is not null
            then 'applied' else 'MISSING' end
union all
select '076_training_partner_trigger',
       case when (select to_regprocedure('public.upsert_training_partners_on_attendance()')) is not null
            then 'applied' else 'MISSING' end
union all
select '077_backfill_training_partners',
       case when exists (select 1 from public.training_partners limit 1)
            then 'applied (rows present)' else 'MISSING or empty gym' end
union all
select '078_bump_longest_streak',
       case when (select to_regprocedure('public.bump_longest_streak(uuid,integer)')) is not null
            then 'applied' else 'MISSING' end
union all
select '079_attendance_counter_trigger',
       case when (select to_regprocedure('public.refresh_client_attendance_counters()')) is not null
              and exists (
                select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'clients'
                  and column_name = 'current_streak_days'
              )
            then 'applied' else 'MISSING' end
union all
select '080_team_health_snapshot',
       -- 080 redefines list_teams_for_gym with extra columns
       -- (healthy_count, watch_count, at_risk_count). We check for
       -- the new columns in the function's row-type by looking at
       -- pg_proc.proargtypes — easier: check for at_risk_count
       -- inside any view/function definition.
       case when exists (
         select 1 from pg_proc p
         where p.proname = 'list_teams_for_gym'
           and pg_get_function_result(p.oid) like '%at_risk_count%'
       ) then 'applied' else 'MISSING' end
union all
select '081_intelligence_email_preference',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'gyms'
           and column_name = 'intelligence_email_enabled'
       ) then 'applied' else 'MISSING' end
union all
select '082_gym_audit_log',
       case when (select to_regclass('public.gym_audit_log')) is not null
            then 'applied' else 'MISSING' end
union all
select '083_client_attendance_refunds',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'client_attendance'
           and column_name = 'refunded_amount_cents'
       ) then 'applied' else 'MISSING' end
union all
select '084_cron_advisory_lock',
       case when (select to_regprocedure('public.cron_try_lock(text)')) is not null
              and (select to_regprocedure('public.cron_release_lock(text)')) is not null
            then 'applied' else 'MISSING' end
union all
select '086_finalize_payment_allow_voided',
       -- 086 redefines finalize_payment to accept the 'voided' status
       -- (Wompi VOIDED). Detect by the 'voided' literal in the function
       -- body — 047's body does not contain it, so this distinguishes
       -- applied (086) from not-yet-applied (047 only).
       case when exists (
         select 1 from pg_proc p
         where p.proname = 'finalize_payment'
           and pg_get_functiondef(p.oid) like '%''voided''%'
       ) then 'applied' else 'MISSING' end
union all
select '087_session_participant_count_trigger',
       case when (select to_regprocedure('public.sync_session_participant_count()')) is not null
              and exists (
                select 1 from pg_trigger
                where tgname = 'trg_sync_session_participant_count'
              )
            then 'applied' else 'MISSING' end
union all
select '088_finalize_payment_tip_fallback',
       -- 088 redefines finalize_payment to add a `tips`-table fallback so
       -- tip charges finalize without a payments row. Detect by the marker
       -- comment baked into the function body — 086/047 do not contain it.
       case when exists (
         select 1 from pg_proc p
         where p.proname = 'finalize_payment'
           and pg_get_functiondef(p.oid) like '%088: tip finalization fallback%'
       ) then 'applied' else 'MISSING' end
union all
select '089_align_referrals',
       -- 089 makes referrals.referred_id nullable + adds converted_at for the
       -- template-row pattern. converted_at is the cleanest detectable marker.
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'referrals' and column_name = 'converted_at'
       ) then 'applied' else 'MISSING' end
union all
select '090_community_banners_bucket',
       case when exists (
         select 1 from storage.buckets where id = 'community-banners'
       ) then 'applied' else 'MISSING' end
union all
select '091_media_bucket',
       case when exists (
         select 1 from storage.buckets where id = 'media'
       ) then 'applied' else 'MISSING' end
union all
select '092_fix_community_rls_recursion',
       -- 092 replaces the recursive community_posts SELECT policy with the
       -- is_community_member-based one. Detect by the new policy name.
       case when exists (
         select 1 from pg_policies
         where tablename = 'community_posts'
           and policyname = 'Public posts + members + author can read'
       ) then 'applied' else 'MISSING' end
union all
select '093_restore_users_select_grant',
       -- 093 restores table-level SELECT on public.users to the authenticated
       -- role (the grant that, when missing, blanked every profile page).
       case when exists (
         select 1 from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'users'
           and grantee = 'authenticated' and privilege_type = 'SELECT'
       ) then 'applied' else 'MISSING' end
union all
select '094_release_notes',
       case when to_regclass('public.release_notes') is not null
              and exists (
                select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'users' and column_name = 'last_seen_release'
              )
            then 'applied' else 'MISSING' end
order by migration;
